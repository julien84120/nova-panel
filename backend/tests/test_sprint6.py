import pytest
from fastapi.testclient import TestClient

from app.auth import AuthError
from app.main import app
from app.notify import _md

H = {"X-Nova-Request": "1"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        try:
            app.state.auth.create_user("sprint6", "sprint6-password")
        except AuthError:
            pass
        assert c.post(
            "/api/auth/login", json={"username": "sprint6", "password": "sprint6-password"}, headers=H
        ).is_success
        yield c


def test_snapshots_crud(client):
    allsnaps = client.get("/api/snapshots").json()
    assert {s["guest_id"] for s in allsnaps} >= {"101", "205"}
    url = "/api/proxmox/guests/pve-01/qemu/103/snapshots"
    before = client.get(url).json()
    assert client.post(url, json={"name": "1bad name"}, headers=H).status_code == 400
    r = client.post(url, json={"name": "test-snap", "description": "ci", "vmstate": True}, headers=H)
    assert r.status_code == 200 and r.json()["upid"].startswith("UPID:")
    after = client.get(url).json()
    assert len(after) == len(before) + 1 and after[-1]["name"] == "test-snap" and after[-1]["vmstate"]
    # Rollback : confirmation obligatoire
    rb = f"{url}/test-snap/rollback"
    assert client.post(rb, json={"confirm": "wrong"}, headers=H).json()["detail"] == "confirmation_mismatch"
    assert client.post(rb, json={"confirm": "test-snap"}, headers=H).status_code == 200
    assert client.delete(f"{url}/test-snap").status_code == 403  # CSRF
    assert client.delete(f"{url}/test-snap", headers=H).status_code == 200
    assert [s["name"] for s in client.get(url).json()] == [s["name"] for s in before]
    actions = [a["action"] for a in client.get("/api/audit").json()[:3]]
    assert actions == ["snapshot_delete", "snapshot_rollback", "snapshot_create"]


def test_alerts_lifecycle(client):
    active = client.post("/api/alerts/evaluate", headers=H).json()
    rules = {a["rule"] for a in active}
    assert {"uncovered_guests", "snapshot_age"} <= rules
    # Seuil CPU très bas → alerte immédiate (durée 0), puis résolution quand on le remonte
    cfg = client.get("/api/alerts/config").json()
    cfg["rules"]["cpu"].update(threshold=1, minutes=0)
    assert client.put("/api/alerts/config", json=cfg, headers=H).is_success
    active = client.post("/api/alerts/evaluate", headers=H).json()
    cpu = [a for a in active if a["rule"] == "cpu"]
    assert len(cpu) >= 3 and all(a["severity"] == "warning" for a in cpu)
    assert client.post(f"/api/alerts/{cpu[0]['id']}/ack", headers=H).is_success
    cfg["rules"]["cpu"].update(threshold=100)
    client.put("/api/alerts/config", json=cfg, headers=H)
    active = client.post("/api/alerts/evaluate", headers=H).json()
    assert not [a for a in active if a["rule"] == "cpu"]
    hist = client.get("/api/alerts", params={"state": "all"}).json()
    resolved = [a for a in hist if a["rule"] == "cpu"]
    assert resolved and all(a["resolved_at"] for a in resolved)
    assert any(a["acknowledged"] and a["ack_by"] == "sprint6" for a in resolved)


def test_channels_secrets_and_test(client, monkeypatch):
    sent = []

    class Resp:
        ok = True

        def raise_for_status(self):
            pass

    monkeypatch.setattr("app.notify.requests.post", lambda url, **kw: sent.append((url, kw)) or Resp())
    cfg = client.get("/api/alerts/config").json()
    cfg["channels"] = [
        {
            "type": "discord",
            "name": "Discord",
            "enabled": True,
            "min_severity": "info",
            "config": {"url": "https://discord.example/webhook/secret"},
        }
    ]
    saved = client.put("/api/alerts/config", json=cfg, headers=H).json()
    ch = saved["channels"][0]
    assert ch["config"]["url"] == "__secret__"  # secret jamais renvoyé
    # Ré-enregistrement sans toucher au secret : il est conservé
    client.put("/api/alerts/config", json=saved, headers=H)
    assert client.post(f"/api/alerts/channels/{ch['id']}/test", headers=H).is_success
    assert sent[-1][0] == "https://discord.example/webhook/secret"
    assert "embeds" in sent[-1][1]["json"]
    assert client.post("/api/alerts/channels/nope/test", headers=H).status_code == 404
    bad = {**saved, "channels": [{"type": "sms", "config": {}}]}
    assert client.put("/api/alerts/config", json=bad, headers=H).status_code == 400


def test_telegram_escape():
    assert _md("CPU 95% (pve-01)!") == r"CPU 95% \(pve\-01\)\!"
    assert _md("a\\b") == r"a\\b"


def test_notify_errors_never_leak_url():
    from app.notify import NotifyError, send

    ch = {"type": "webhook", "config": {"url": "http://127.0.0.1:9/hook-SECRET-TOKEN"}}
    with pytest.raises(NotifyError) as exc:
        send(ch, {"event": "test", "severity": "info", "title": "t", "detail": "d"})
    assert "SECRET" not in str(exc.value) and "127.0.0.1" not in str(exc.value)
