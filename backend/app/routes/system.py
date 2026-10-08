"""Mise à jour de NovaPanel depuis l'interface (installation native systemd)."""

from __future__ import annotations

import time
from pathlib import Path

import requests
from fastapi import APIRouter, HTTPException, Request

from app import __version__

router = APIRouter(prefix="/api/system")
UPDATE_UNIT = Path("/etc/systemd/system/novapanel-update.path")
_latest: dict = {"at": 0.0, "tag": None}


def _latest_version() -> str | None:
    if time.time() - _latest["at"] > 3600:
        try:
            r = requests.get("https://api.github.com/repos/julien84120/nova-panel/releases/latest", timeout=5)
            r.raise_for_status()
            _latest["tag"] = r.json().get("tag_name")
        except Exception:  # noqa: BLE001 — pas d'Internet : on n'affiche simplement pas de nouvelle version
            pass
        _latest["at"] = time.time()
    return _latest["tag"]


def _ver(v: str | None) -> tuple:
    try:
        return tuple(int(x) for x in (v or "").lstrip("v").split("."))
    except ValueError:
        return ()


def _files(request: Request) -> tuple[Path, Path]:
    d = Path(request.app.state.settings.nova_data_dir)
    return d / "update.request", d / "update.log"


@router.get("/update")
def update_status(request: Request):
    req, log = _files(request)
    latest = _latest_version()
    tail = log.read_text(errors="replace").splitlines()[-40:] if log.exists() else []
    finished = any(line.startswith("__NOVA_UPDATE_EXIT=") for line in tail)
    running = req.exists() or (log.exists() and not finished and time.time() - log.stat().st_mtime < 900)
    exit_code = next((int(x.split("=")[1]) for x in reversed(tail) if x.startswith("__NOVA_UPDATE_EXIT=")), None)
    return {
        "current": __version__,
        "latest": latest.lstrip("v") if latest else None,
        "available": bool(latest) and _ver(latest) > _ver(__version__),
        "supported": UPDATE_UNIT.exists(),
        "running": running,
        "last_exit": exit_code,
        "last_run": int(log.stat().st_mtime) if log.exists() else None,
        "log": [x for x in tail if not x.startswith("__NOVA_UPDATE_EXIT=")],
    }


@router.post("/update")
def update_start(request: Request):
    if not UPDATE_UNIT.exists():
        raise HTTPException(400, "update_unsupported")
    req, _ = _files(request)
    if req.exists():
        raise HTTPException(409, "update_running")
    req.write_text(f"{request.state.user.username} {int(time.time())}\n")
    request.app.state.audit.add(request.state.user.username, "novapanel", "system_update", f"v{__version__}", "running")
    return {"ok": True}
