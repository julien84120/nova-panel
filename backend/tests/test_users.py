from fastapi.testclient import TestClient

from app.auth import AuthError
from app.main import app

H = {"X-Nova-Request": "1"}


def _login(c: TestClient, user: str, pw: str):
    c.cookies.clear()
    return c.post("/api/auth/login", json={"username": user, "password": pw}, headers=H)


def test_roles_and_user_management():
    with TestClient(app) as c:
        try:
            app.state.auth.create_user("boss", "boss-password-1")
        except AuthError:
            pass
        assert _login(c, "boss", "boss-password-1").is_success
        me = next(u for u in c.get("/api/users").json() if u["username"] == "boss")
        assert me["role"] == "admin"

        # Création d'un lecteur et d'un opérateur
        for name, role in (("lecteur", "viewer"), ("ops", "operator")):
            r = c.post("/api/users", json={"username": name, "password": f"{name}-password", "role": role}, headers=H)
            assert r.status_code in (200, 409)
        assert (
            c.post("/api/users", json={"username": "x1x", "password": "short", "role": "viewer"}, headers=H).status_code
            == 400
        )
        assert (
            c.post(
                "/api/users", json={"username": "zz9", "password": "long-enough-pw", "role": "god"}, headers=H
            ).status_code
            == 400
        )
        users = {u["username"]: u for u in c.get("/api/users").json()}
        assert users["lecteur"]["role"] == "viewer" and users["ops"]["role"] == "operator"

        # Garde-fous sur soi-même
        assert (
            c.patch(f"/api/users/{me['id']}", json={"role": "viewer"}, headers=H).json()["detail"]
            == "cannot_modify_self"
        )
        assert c.delete(f"/api/users/{me['id']}", headers=H).json()["detail"] == "cannot_modify_self"

        # Lecteur : lecture seule
        assert _login(c, "lecteur", "lecteur-password").is_success
        assert c.get("/api/auth/status").json()["user"]["role"] == "viewer"
        assert c.get("/api/dashboard").is_success
        r = c.post("/api/proxmox/guests/pve-01/qemu/103/shutdown", headers=H)
        assert r.status_code == 403 and r.json()["detail"] == "forbidden_role"
        assert c.post("/api/alerts/evaluate", headers=H).status_code == 403
        assert c.get("/api/users").status_code == 403
        assert c.get("/api/alerts/config").status_code == 403

        # Opérateur : actions oui, administration non
        assert _login(c, "ops", "ops-password").is_success
        assert c.post("/api/proxmox/guests/pve-01/qemu/103/reboot", headers=H).is_success
        assert c.post("/api/alerts/evaluate", headers=H).is_success
        assert c.get("/api/users").status_code == 403
        assert c.put("/api/alerts/config", json={}, headers=H).status_code == 403

        # L'admin désactive l'opérateur → sa session tombe, il ne peut plus se connecter
        ops_cookie = c.cookies.get("nova_session")
        assert _login(c, "boss", "boss-password-1").is_success
        u = c.patch(f"/api/users/{users['ops']['id']}", json={"disabled": True}, headers=H).json()
        assert u["disabled"] and u["sessions"] == 0
        c.cookies.clear()
        c.cookies.set("nova_session", ops_cookie)
        assert c.get("/api/dashboard").status_code == 401
        assert _login(c, "ops", "ops-password").json()["detail"] == "account_disabled"

        # Réinitialisation du mot de passe + changement de rôle par l'admin
        assert _login(c, "boss", "boss-password-1").is_success
        c.patch(
            f"/api/users/{users['ops']['id']}",
            json={"disabled": False, "password": "new-ops-password", "role": "admin"},
            headers=H,
        )
        assert _login(c, "ops", "ops-password").status_code == 401
        assert _login(c, "ops", "new-ops-password").is_success
        assert c.get("/api/auth/status").json()["user"]["role"] == "admin"

        # Dernier administrateur protégé : ops (admin) supprime boss, puis ne peut plus se rétrograder/supprimer
        boss_id = me["id"]
        assert c.delete(f"/api/users/{boss_id}", headers=H).is_success
        ops_id = users["ops"]["id"]
        assert c.patch(f"/api/users/{ops_id}", json={"role": "viewer"}, headers=H).status_code == 409
        actions = [a["action"] for a in c.get("/api/audit").json()[:4]]
        assert "user_delete" in actions
        # Remise en état pour les autres tests
        app.state.auth.create_user("boss", "boss-password-1")


def test_migration_keeps_existing_accounts_admin(tmp_path):
    import sqlite3

    from app.db import Database

    db = tmp_path / "old.db"
    con = sqlite3.connect(db)
    con.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE,"
        " password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
    )
    con.execute("INSERT INTO users (username, password_hash, created_at, updated_at) VALUES ('julien', 'x', 0, 0)")
    con.commit()
    con.close()
    with Database(db).connect() as c:
        row = c.execute("SELECT role, disabled, last_login FROM users").fetchone()
    assert (row["role"], row["disabled"], row["last_login"]) == ("admin", 0, None)
