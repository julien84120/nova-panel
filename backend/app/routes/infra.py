"""Pages détaillées (nœuds, invités, Docker, stockage, tâches) et actions."""

from __future__ import annotations

import logging
import re
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from proxmoxer.core import ResourceException
from pydantic import BaseModel

from app.audit import AuditLog
from app.collector import Collector
from app.schemas import AuditEntry, Guest, Storage, Task
from app.services import demo
from app.services.docker_host import CONTAINER_ACTIONS
from app.services.proxmox import GUEST_ACTIONS, NODE_RE, valid_upid

log = logging.getLogger("novapanel.actions")
router = APIRouter(prefix="/api")
Timeframe = Literal["hour", "day", "week", "month"]
CID_RE = re.compile(r"^[0-9a-f]{6,64}$")


def _collector(request: Request) -> Collector:
    return request.app.state.collector


def _audit(request: Request) -> AuditLog:
    return request.app.state.audit


def _user(request: Request) -> str:
    return request.state.user.username


def _snapshot(request: Request):
    snap = _collector(request).snapshot
    if snap is None:
        raise HTTPException(503, "collector_not_ready")
    return snap


def _find_guest(request: Request, gtype: str, gid: str, host: str | None = None) -> Guest:
    for g in _snapshot(request).guests:
        if g.type == gtype and g.id == gid and (host is None or g.host == host):
            return g
    raise HTTPException(404, "guest_not_found")


def _check_node(node: str) -> None:
    if not NODE_RE.match(node):
        raise HTTPException(400, "invalid_node")


def _source_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ResourceException):
        if exc.status_code == 403:
            return HTTPException(403, f"permission_denied: {exc.content or exc.status_message}"[:300])
        return HTTPException(502, f"proxmox_error: {exc.status_code} {exc.content or exc.status_message}"[:300])
    status = getattr(getattr(exc, "response", None), "status_code", None)
    if status == 404:
        return HTTPException(404, "not_found")
    if status == 409:
        return HTTPException(409, f"conflict: {getattr(exc, 'explanation', '') or exc}"[:300])
    return HTTPException(502, f"source_error: {exc}"[:300])


def _require_actions(request: Request) -> None:
    if not request.app.state.settings.nova_actions:
        raise HTTPException(403, "actions_disabled")


# ── Lectures ─────────────────────────────────────────────────
@router.get("/storages", response_model=list[Storage])
def storages(request: Request):
    return _snapshot(request).storages


@router.get("/tasks", response_model=list[Task])
def tasks(request: Request):
    return _snapshot(request).tasks


@router.get("/audit", response_model=list[AuditEntry])
def audit(request: Request, limit: int = Query(100, ge=1, le=500)):
    return _audit(request).recent(limit)


@router.get("/proxmox/nodes/{node}")
def node_detail(node: str, request: Request, timeframe: Timeframe = "hour"):
    _check_node(node)
    col = _collector(request)
    if col.proxmox is None:
        d = demo.demo_node_detail(node)
        if d is None:
            raise HTTPException(404, "node_not_found")
        return d
    try:
        return col.proxmox.node_detail(node, timeframe)
    except Exception as exc:  # noqa: BLE001
        raise _source_error(exc) from exc


@router.get("/proxmox/guests/{node}/{gtype}/{vmid}")
def guest_detail(node: str, gtype: Literal["qemu", "lxc"], vmid: int, request: Request, timeframe: Timeframe = "hour"):
    _check_node(node)
    _find_guest(request, gtype, str(vmid), node)
    col = _collector(request)
    if col.proxmox is None:
        return demo.demo_guest_detail(gtype, str(vmid), node)
    try:
        return col.proxmox.guest_detail(node, gtype, vmid, timeframe)
    except Exception as exc:  # noqa: BLE001
        raise _source_error(exc) from exc


@router.get("/proxmox/task")
def task_status(request: Request, node: str, upid: str):
    _check_node(node)
    if not valid_upid(upid):
        raise HTTPException(400, "invalid_upid")
    col = _collector(request)
    if col.proxmox is None or ":DEMO:" in upid:
        result = {"upid": upid, "running": False, "ok": True, "exitstatus": "OK", "log": ["TASK OK"]}
    else:
        try:
            result = col.proxmox.task_status(node, upid)
        except Exception as exc:  # noqa: BLE001
            raise _source_error(exc) from exc
    if not result["running"]:
        _audit(request).update_by_ref(upid, "ok" if result["ok"] else "error", result.get("exitstatus", ""))
    return result


@router.get("/docker/containers/{cid}/logs")
def container_logs(cid: str, request: Request, tail: int = Query(200, ge=1, le=2000)):
    g = _find_guest(request, "docker", cid)
    col = _collector(request)
    if col.docker is None:
        return {"id": cid, "name": g.name, "logs": demo.demo_logs(g.name)}
    try:
        return {"id": cid, "name": g.name, "logs": col.docker.container_logs(cid, tail)}
    except Exception as exc:  # noqa: BLE001
        raise _source_error(exc) from exc


@router.get("/metrics/history")
def metrics_history(request: Request, range: Literal["hour", "day", "week"] = "hour", host: str | None = None):
    """Historique CPU / mémoire par hôte (base locale + RRD Proxmox)."""
    snap = _snapshot(request)
    hosts = {h.id: h for h in snap.hosts}
    if host and host not in hosts:
        raise HTTPException(404, "host_not_found")
    store = _collector(request).metrics
    series = store.query(range, host) if store else {}
    return {
        "range": range,
        "hosts": [
            {"id": hid, "name": hosts[hid].name, "kind": hosts[hid].kind, "points": series.get(hid, [])}
            for hid in ([host] if host else list(hosts))
        ],
    }


@router.get("/network")
def network(request: Request):
    col = _collector(request)
    snap = _snapshot(request)
    if col.proxmox is None and col.docker is None:
        return {**demo.demo_network(col.settings.docker_display_name), "errors": []}
    fake = demo.demo_network(col.settings.docker_display_name)
    result: dict = {"interfaces": [], "guest_nics": [], "docker_networks": [], "errors": []}
    if col.proxmox is None:
        result["interfaces"], result["guest_nics"] = fake["interfaces"], fake["guest_nics"]
    else:
        try:
            pve = col.cached("network:pve", 60, lambda: col.proxmox.network(snap.guests))
            result["interfaces"], result["guest_nics"] = pve["interfaces"], pve["guest_nics"]
        except Exception as exc:  # noqa: BLE001
            result["errors"].append({"source": "proxmox", "detail": str(_source_error(exc).detail)})
    if col.docker is None:
        result["docker_networks"] = fake["docker_networks"]
    else:
        try:
            result["docker_networks"] = col.cached("network:docker", 60, col.docker.networks)
        except Exception as exc:  # noqa: BLE001
            result["errors"].append({"source": "docker", "detail": str(_source_error(exc).detail)})
    return result


@router.get("/backups")
def backups(request: Request):
    col = _collector(request)
    snap = _snapshot(request)
    if col.proxmox is None:
        data = demo.demo_backups()
    else:
        try:
            data = col.cached("backups", 60, lambda: col.proxmox.backups(snap.storages, snap.guests))
        except Exception as exc:  # noqa: BLE001
            raise _source_error(exc) from exc
    return {**data, "tasks": [t.model_dump() for t in snap.tasks if t.type == "vzdump"]}


# ── Actions ──────────────────────────────────────────────────
class BackupRequest(BaseModel):
    storage: str
    mode: Literal["snapshot", "suspend", "stop"] = "snapshot"


@router.post("/proxmox/guests/{node}/{gtype}/{vmid}/backup")
def guest_backup(node: str, gtype: Literal["qemu", "lxc"], vmid: int, body: BackupRequest, request: Request):
    _require_actions(request)
    _check_node(node)
    g = _find_guest(request, gtype, str(vmid), node)
    snap = _snapshot(request)
    if not any(st.name == body.storage and "backup" in st.content and st.status == "available" for st in snap.storages):
        raise HTTPException(400, "invalid_backup_storage")
    col, audit_log, user = _collector(request), _audit(request), _user(request)
    target = f"{'VM' if gtype == 'qemu' else 'CT'} {vmid} ({g.name}) → {body.storage}"
    try:
        if col.proxmox is None:
            upid = demo.demo_backup_now(gtype, str(vmid), node, body.storage, f"{user}@novapanel")
        else:
            upid = col.proxmox.guest_backup(node, vmid, body.storage, body.mode)
    except Exception as exc:  # noqa: BLE001
        err = _source_error(exc)
        audit_log.add(user, "proxmox", "backup", target, "error", str(err.detail))
        raise err from exc
    audit_log.add(user, "proxmox", "backup", target, "running", ref=upid)
    log.info("%s: backup %s (tâche %s)", user, target, upid)
    col.invalidate("backups")
    col.refresh_soon()
    return {"upid": upid, "node": node}


@router.post("/proxmox/guests/{node}/{gtype}/{vmid}/{action}")
def guest_action(node: str, gtype: Literal["qemu", "lxc"], vmid: int, action: str, request: Request):
    _require_actions(request)
    _check_node(node)
    if action not in GUEST_ACTIONS[gtype]:
        raise HTTPException(400, "unsupported_action")
    g = _find_guest(request, gtype, str(vmid), node)
    col, audit_log, user = _collector(request), _audit(request), _user(request)
    target = f"{'VM' if gtype == 'qemu' else 'CT'} {vmid} ({g.name})"
    try:
        if col.proxmox is None:
            upid = demo.demo_action(gtype, str(vmid), node, action, f"{user}@novapanel")
        else:
            upid = col.proxmox.guest_action(node, gtype, vmid, action)
    except Exception as exc:  # noqa: BLE001
        err = _source_error(exc)
        audit_log.add(user, "proxmox", action, target, "error", str(err.detail))
        log.warning("%s: %s %s → %s", user, action, target, err.detail)
        raise err from exc
    audit_log.add(user, "proxmox", action, target, "running", ref=upid)
    log.info("%s: %s %s (tâche %s)", user, action, target, upid)
    col.refresh_soon()
    return {"upid": upid, "node": node}


@router.post("/docker/containers/{cid}/{action}")
def container_action(cid: str, action: str, request: Request):
    _require_actions(request)
    if not CID_RE.match(cid):
        raise HTTPException(400, "invalid_container_id")
    if action not in CONTAINER_ACTIONS:
        raise HTTPException(400, "unsupported_action")
    g = _find_guest(request, "docker", cid)
    col, audit_log, user = _collector(request), _audit(request), _user(request)
    target = f"{g.name} ({g.host})"
    try:
        if col.docker is None:
            demo.demo_action("docker", cid, g.host, action, user)
        else:
            col.docker.container_action(cid, action)
    except Exception as exc:  # noqa: BLE001
        err = _source_error(exc)
        audit_log.add(user, "docker", action, target, "error", str(err.detail))
        log.warning("%s: %s %s → %s", user, action, target, err.detail)
        raise err from exc
    audit_log.add(user, "docker", action, target, "ok")
    log.info("%s: %s %s", user, action, target)
    col.refresh_soon((0.5, 3.0))
    return {"ok": True}
