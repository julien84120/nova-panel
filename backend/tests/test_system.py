from fastapi.testclient import TestClient

from app.auth import AuthError
from app.main import app
from app.routes import system

H = {"X-Nova-Request": "1"}


def test_update_endpoint(monkeypatch, tmp_path):
    monkeypatch.setattr(system, "_latest_version", lambda: "v9.9.9")
    with TestClient(app) as c:
        try:
            app.state.auth.create_user("sysadmin", "sysadmin-password")
            app.state.auth.create_user("sysview", "sysview-password", "viewer")
        except AuthError:
            pass
        c.post("/api/auth/login", json={"username": "sysview", "password": "sysview-password"}, headers=H)
        assert c.get("/api/system/update").status_code == 403
        c.cookies.clear()
        c.post("/api/auth/login", json={"username": "sysadmin", "password": "sysadmin-password"}, headers=H)
        st = c.get("/api/system/update").json()
        assert st["available"] and st["latest"] == "9.9.9" and st["supported"] is False
        assert c.post("/api/system/update", headers=H).json()["detail"] == "update_unsupported"
        # Installation native simulée : la demande est déposée pour l'unité systemd
        unit = tmp_path / "novapanel-update.path"
        unit.write_text("")
        monkeypatch.setattr(system, "UPDATE_UNIT", unit)
        assert c.post("/api/system/update", headers=H).is_success
        assert c.get("/api/system/update").json()["running"] is True
        assert c.post("/api/system/update", headers=H).status_code == 409
        req, _ = system._files(type("R", (), {"app": app})())
        req.unlink()
