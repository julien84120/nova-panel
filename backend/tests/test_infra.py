import pytest
from fastapi.testclient import TestClient

from app.auth import AuthError
from app.main import app
from app.services.docker_host import parse_ports, started_uptime
from app.services.proxmox import build_guest_detail

H = {"X-Nova-Request": "1"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        try:
            app.state.auth.create_user("operator", "operator-password")
        except AuthError:
            pass
        r = c.post("/api/auth/login", json={"username": "operator", "password": "operator-password"}, headers=H)
        assert r.status_code == 200
        yield c


def _guest(client, gtype, gid):
    return next(
        g
        for g in client.post("/api/dashboard/refresh", headers=H).json()["guests"]
        if g["type"] == gtype and g["id"] == gid
    )


def test_reads(client):
    st = client.get("/api/storages").json()
    assert any(s["type"] == "lvmthin" for s in st) and any(s["kind"] == "docker" for s in st)
    assert len(client.get("/api/tasks").json()) >= 4
    n = client.get("/api/proxmox/nodes/pve-01").json()
    assert n["threads"] == 32 and len(n["history"]) > 10
    assert client.get("/api/proxmox/nodes/bad$node").status_code in (400, 404)
    g = client.get("/api/proxmox/guests/pve-01/qemu/101").json()
    assert g["name"] == "k8s-worker-01" and g["disks"] and g["nets"]
    assert client.get("/api/proxmox/guests/pve-01/qemu/999").status_code == 404
    assert client.get("/api/proxmox/guests/pve-02/qemu/101").status_code == 404  # mauvais nœud
    logs = client.get("/api/docker/containers/7f3a1c/logs").json()
    assert "postgres-16" in logs["logs"]


def test_proxmox_action_flow(client):
    assert _guest(client, "qemu", "103")["status"] == "running"
    # CSRF obligatoire
    assert client.post("/api/proxmox/guests/pve-01/qemu/103/shutdown").status_code == 403
    assert client.post("/api/proxmox/guests/pve-01/qemu/103/format", headers=H).status_code == 400
    assert client.post("/api/proxmox/guests/pve-02/lxc/205/suspend", headers=H).status_code == 400  # pas pour LXC
    r = client.post("/api/proxmox/guests/pve-01/qemu/103/shutdown", headers=H)
    assert r.status_code == 200, r.text
    upid = r.json()["upid"]
    assert _guest(client, "qemu", "103")["status"] == "stopped"
    t = client.get("/api/proxmox/task", params={"node": "pve-01", "upid": upid}).json()
    assert t["running"] is False and t["ok"] is True
    entry = client.get("/api/audit").json()[0]
    assert entry["action"] == "shutdown" and entry["status"] == "ok" and entry["username"] == "operator"
    assert client.post("/api/proxmox/guests/pve-01/qemu/103/start", headers=H).status_code == 200
    assert _guest(client, "qemu", "103")["status"] == "running"


def test_docker_action_flow(client):
    assert client.post("/api/docker/containers/7f3a1c/rm", headers=H).status_code == 400
    assert client.post("/api/docker/containers/NOT-HEX/stop", headers=H).status_code == 400
    assert client.post("/api/docker/containers/abcdef/stop", headers=H).status_code == 404
    assert client.post("/api/docker/containers/91bd02/stop", headers=H).status_code == 200
    assert _guest(client, "docker", "91bd02")["status"] == "stopped"
    assert client.post("/api/docker/containers/91bd02/start", headers=H).status_code == 200
    g = _guest(client, "docker", "91bd02")
    assert g["status"] == "running" and g["image"] == "nginx:1.27" and g["ports"]


def test_actions_can_be_disabled(client):
    app.state.settings.nova_actions = False
    try:
        assert client.post("/api/docker/containers/91bd02/restart", headers=H).json()["detail"] == "actions_disabled"
        assert client.post("/api/dashboard/refresh", headers=H).json()["actions_enabled"] is False
    finally:
        app.state.settings.nova_actions = True


def test_helpers():
    attrs = {
        "NetworkSettings": {
            "Ports": {
                "80/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8080"}, {"HostIp": "::", "HostPort": "8080"}],
                "443/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8443"}],
                "9000/tcp": None,
            }
        },
        "State": {"StartedAt": "2026-10-08T01:00:00.123456789Z"},
    }
    assert parse_ports(attrs) == ["127.0.0.1:8443→443/tcp", "8080→80/tcp"]
    assert started_uptime(attrs, 1791421200 + 3600) >= 0
    assert started_uptime({"State": {"StartedAt": "0001-01-01T00:00:00Z"}}, 0) == 0
    d = build_guest_detail(
        "qemu",
        100,
        "pve",
        {"status": "running", "cpu": 0.1, "cpus": 2, "mem": 1, "maxmem": 2, "name": "web"},
        {
            "scsi0": "local-lvm:vm-100-disk-0,size=32G",
            "ide2": "local:iso/x.iso,media=cdrom",
            "net0": "virtio=AA,bridge=vmbr0",
            "tags": "a;b",
            "agent": "1,fstrim_cloned_disks=1",
            "onboot": 1,
        },
        [{"time": 1, "cpu": 0.5, "mem": 1, "maxmem": 2}],
    )
    assert [x["id"] for x in d["disks"]] == ["scsi0"] and d["tags"] == ["a", "b"] and d["agent"] and d["onboot"]
    assert d["history"][0] == {"t": 1, "cpu": 50.0, "memory": 50.0, "netin": 0, "netout": 0}


def test_metrics_history_per_host(client):
    allh = client.get("/api/metrics/history", params={"range": "day"}).json()
    ids = {h["id"] for h in allh["hosts"]}
    assert {"pve:pve-01", "pve:pve-02"} <= ids and any(i.startswith("docker:") for i in ids)
    by = {h["id"]: h for h in allh["hosts"]}
    assert len(by["pve:pve-01"]["points"]) > 50
    # séries distinctes par hôte
    assert by["pve:pve-01"]["points"][-5]["cpu"] != by["pve:pve-02"]["points"][-5]["cpu"]
    one = client.get("/api/metrics/history", params={"range": "hour", "host": "pve:pve-02"}).json()
    assert [h["id"] for h in one["hosts"]] == ["pve:pve-02"] and len(one["hosts"][0]["points"]) > 10
    assert client.get("/api/metrics/history", params={"host": "nope"}).status_code == 404
    assert client.get("/api/metrics/history", params={"range": "year"}).status_code == 422


def test_network_and_backups(client):
    n = client.get("/api/network").json()
    assert any(i["type"] == "bridge" for i in n["interfaces"]) and n["guest_nics"] and n["docker_networks"]
    b = client.get("/api/backups").json()
    assert b["jobs"] and b["files"] and {x["vmid"] for x in b["not_backed_up"]} == {"110", "207"}
    before = len(b["files"])
    bad = client.post("/api/proxmox/guests/pve-01/qemu/103/backup", json={"storage": "local-lvm"}, headers=H)
    assert bad.status_code == 400  # stockage sans contenu « backup »
    r = client.post("/api/proxmox/guests/pve-01/qemu/103/backup", json={"storage": "nas-backup"}, headers=H)
    assert r.status_code == 200, r.text
    assert len(client.get("/api/backups").json()["files"]) == before + 1
    assert client.get("/api/audit").json()[0]["action"] == "backup"


def test_parsers_network():
    from app.schemas import Guest
    from app.services.proxmox import normalize_backup, normalize_job, parse_guest_nics

    g = Guest(id="100", name="web", type="qemu", host="pve", status="running", cpu=0, mem_used=0, mem_total=0)
    nics = parse_guest_nics(
        g,
        {
            "net0": "virtio=BC:24:11:AA:BB:CC,bridge=vmbr0,firewall=1,tag=20",
            "ipconfig0": "ip=10.0.0.5/24,gw=10.0.0.1",
            "name": "web",
        },
    )
    assert nics == [
        {
            "guest_id": "100",
            "guest_name": "web",
            "guest_type": "qemu",
            "node": "pve",
            "status": "running",
            "iface": "net0",
            "model": "virtio",
            "mac": "BC:24:11:AA:BB:CC",
            "bridge": "vmbr0",
            "tag": "20",
            "firewall": True,
            "ip": "10.0.0.5/24",
            "rate": "",
            "link_down": False,
        }
    ]
    ct = Guest(id="200", name="dns", type="lxc", host="pve", status="running", cpu=0, mem_used=0, mem_total=0)
    n2 = parse_guest_nics(ct, {"net0": "name=eth0,bridge=vmbr1,hwaddr=AA:BB,ip=dhcp,type=veth"})
    assert n2[0]["iface"] == "eth0" and n2[0]["bridge"] == "vmbr1" and n2[0]["ip"] == "dhcp"
    assert normalize_job({"id": "j", "all": 1, "enabled": 1, "schedule": "02:30"})["selection"] == "all"
    assert normalize_job({"id": "j", "vmid": "100,101", "enabled": 0})["enabled"] is False
    f = normalize_backup(
        "nas",
        {
            "volid": "nas:backup/vzdump-lxc-200-x.tar.zst",
            "vmid": 200,
            "size": 5,
            "ctime": 9,
            "verification": {"state": "ok"},
        },
    )
    assert f["type"] == "lxc" and f["verified"] == "ok" and f["vmid"] == "200"
