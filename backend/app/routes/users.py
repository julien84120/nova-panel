"""Gestion des comptes (administrateurs uniquement — contrôlé par le middleware)."""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.auth import AuthService

router = APIRouter(prefix="/api/users")


class NewUser(BaseModel):
    username: str
    password: str
    role: str = "viewer"


class UserPatch(BaseModel):
    role: str | None = None
    disabled: bool | None = None
    password: str | None = None


def _auth(request: Request) -> AuthService:
    return request.app.state.auth


def _audit(request: Request, action: str, target: str, detail: str = "") -> None:
    request.app.state.audit.add(request.state.user.username, "novapanel", action, target, "ok", detail)


@router.get("")
def list_users(request: Request):
    return _auth(request).users()


@router.post("")
def create_user(body: NewUser, request: Request):
    user = _auth(request).create_user(body.username, body.password, body.role)
    _audit(request, "user_create", user.username, user.role)
    return next(u for u in _auth(request).users() if u["id"] == user.id)


@router.patch("/{user_id}")
def update_user(user_id: int, body: UserPatch, request: Request):
    u = _auth(request).update_user(request.state.user, user_id, body.role, body.disabled, body.password)
    changes = [f"role={body.role}"] if body.role else []
    if body.disabled is not None:
        changes.append("disabled" if body.disabled else "enabled")
    if body.password is not None:
        changes.append("password_reset")
    _audit(request, "user_update", u["username"], ", ".join(changes))
    return u


@router.delete("/{user_id}")
def delete_user(user_id: int, request: Request):
    name = _auth(request).delete_user(request.state.user, user_id)
    _audit(request, "user_delete", name)
    return {"ok": True}
