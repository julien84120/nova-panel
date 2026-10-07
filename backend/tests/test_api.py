import os

os.environ["NOVA_DEMO"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def test_demo_dashboard():
    with TestClient(app) as client:
        r = client.get("/api/health")
        assert r.status_code == 200 and r.json()["status"] == "ok"

        d = client.get("/api/dashboard").json()
        assert d["demo"] is True
        assert {s["mode"] for s in d["sources"]} == {"demo"}
        assert len(d["hosts"]) == 3
        assert d["summary"]["cores"] == sum(h["cores"] for h in d["hosts"])
        assert 0 <= d["summary"]["cpu"] <= 100
        assert len(d["history"]) > 10

        lxc = client.get("/api/guests", params={"type": "lxc"}).json()
        assert lxc and all(g["type"] == "lxc" for g in lxc)
