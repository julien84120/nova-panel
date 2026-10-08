import pytest
from fastapi.testclient import TestClient

from app.main import app

H = {"X-Nova-Request": "1"}
PASSWORD = "correct-horse-battery"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _setup(client):
    token = app.state.auth.setup_token()
    r = client.post("/api/auth/setup", json={"token": token, "username": "admin", "password": PASSWORD}, headers=H)
    assert r.status_code == 200, r.text
    return r


def test_full_auth_flow(client):
    # Avant installation : tout est fermé sauf le statut
    assert client.get("/api/health").json() == {"status": "ok", "version": app.version}
    st = client.get("/api/auth/status").json()
    assert st["setup_required"] is True and st["authenticated"] is False
    assert client.get("/api/dashboard").status_code == 401

    # CSRF : en-tête obligatoire
    r = client.post("/api/auth/setup", json={"token": "x", "username": "admin", "password": PASSWORD})
    assert r.status_code == 403 and r.json()["detail"] == "csrf_header_missing"

    # Mauvais jeton d'installation, mot de passe trop court
    r = client.post("/api/auth/setup", json={"token": "bad", "username": "admin", "password": PASSWORD}, headers=H)
    assert r.status_code == 403
    token = app.state.auth.setup_token()
    r = client.post("/api/auth/setup", json={"token": token, "username": "admin", "password": "short"}, headers=H)
    assert r.json()["detail"] == "password_too_short"

    # Installation → session ouverte
    r = _setup(client)
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    assert client.get("/api/auth/status").json()["user"] == {"username": "admin", "role": "admin"}
    d = client.get("/api/dashboard").json()
    assert d["demo"] is True and len(d["hosts"]) == 3 and len(d["history"]) > 10
    assert "sources" in client.get("/api/health").json()
    lxc = client.get("/api/guests", params={"type": "lxc"}).json()
    assert lxc and all(g["type"] == "lxc" for g in lxc)

    # Une seconde installation est refusée
    r = client.post("/api/auth/setup", json={"token": token, "username": "x2", "password": PASSWORD}, headers=H)
    assert r.status_code in (403, 409)

    # Déconnexion
    assert client.post("/api/auth/logout", headers=H).status_code == 200
    assert client.get("/api/dashboard").status_code == 401

    # Connexion
    assert client.post("/api/auth/login", json={"username": "admin", "password": "nope"}, headers=H).status_code == 401
    r = client.post("/api/auth/login", json={"username": "ADMIN", "password": PASSWORD}, headers=H)
    assert r.status_code == 200
    assert client.get("/api/dashboard").status_code == 200

    # Changement de mot de passe
    new = "an-even-better-password"
    r = client.post("/api/auth/password", json={"current_password": "wrong", "new_password": new}, headers=H)
    assert r.status_code == 401
    r = client.post("/api/auth/password", json={"current_password": PASSWORD, "new_password": new}, headers=H)
    assert r.status_code == 200
    assert client.get("/api/dashboard").status_code == 200  # session courante renouvelée
    client.post("/api/auth/logout", headers=H)
    assert (
        client.post("/api/auth/login", json={"username": "admin", "password": PASSWORD}, headers=H).status_code == 401
    )
    assert client.post("/api/auth/login", json={"username": "admin", "password": new}, headers=H).status_code == 200


def test_rate_limit(client):
    for _ in range(5):
        r = client.post("/api/auth/login", json={"username": "ghost", "password": "x" * 12}, headers=H)
        assert r.status_code == 401
    r = client.post("/api/auth/login", json={"username": "ghost", "password": "x" * 12}, headers=H)
    assert r.status_code == 429 and int(r.headers["retry-after"]) > 0


def test_security_headers(client):
    r = client.get("/api/auth/status")
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["cache-control"] == "no-store"
    assert client.get("/api/unknown").status_code in (401, 404)
