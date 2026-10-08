"""Alertes et configuration des notifications."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.alerts import AlertService
from app.notify import NotifyError

router = APIRouter(prefix="/api/alerts")


def _svc(request: Request) -> AlertService:
    return request.app.state.alerts


@router.get("")
def list_alerts(request: Request, state: str = "active"):
    return _svc(request).list_alerts(active_only=state == "active")


@router.post("/{alert_id}/ack")
def acknowledge(alert_id: int, request: Request):
    if not _svc(request).acknowledge(alert_id, request.state.user.username):
        raise HTTPException(404, "alert_not_found")
    return {"ok": True}


@router.get("/config")
def get_config(request: Request):
    return _svc(request).public_config()


@router.put("/config")
async def put_config(request: Request):
    body = await request.json()
    try:
        cfg = _svc(request).save_config(body)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    request.app.state.audit.add(request.state.user.username, "novapanel", "alerts_config", "notifications", "ok")
    return cfg


@router.post("/channels/{channel_id}/test")
def test_channel(channel_id: str, request: Request):
    try:
        _svc(request).test_channel(channel_id)
    except KeyError as exc:
        raise HTTPException(404, "channel_not_found") from exc
    except NotifyError as exc:
        raise HTTPException(502, f"notify_failed: {exc}") from exc
    return {"ok": True}


@router.post("/evaluate")
def evaluate_now(request: Request):
    """Réévalue immédiatement les règles (après un changement de configuration)."""
    col = request.app.state.collector
    col._extras_at = 0
    col.run_alerts()
    return _svc(request).list_alerts(active_only=True)
