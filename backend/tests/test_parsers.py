from app.services.docker_host import container_cpu_percent, container_mem, parse_host_probe
from app.services.proxmox import build_proxmox_data

PROBE = """cpu  1000 0 500 8000 500 0 0 0 0 0
cpu  1100 0 550 8300 550 0 0 0 0 0
MemTotal:       24000000 kB
MemAvailable:   12000000 kB
 208000000000 77000000000
3456000.12
4
Ubuntu 24.04.3 LTS
"""


def test_parse_host_probe():
    m = parse_host_probe(PROBE)
    # delta total = 500, delta idle(+iowait) = 350 → 30 % de CPU
    assert m.cpu == 30.0
    assert m.cores == 4
    assert m.mem_total == 24000000 * 1024
    assert m.mem_used == 12000000 * 1024
    assert (m.disk_total, m.disk_used) == (208000000000, 77000000000)
    assert m.uptime == 3456000
    assert m.os == "Ubuntu 24.04.3 LTS"


def test_container_stats():
    stats = {
        "cpu_stats": {"cpu_usage": {"total_usage": 2_000}, "system_cpu_usage": 20_000, "online_cpus": 4},
        "precpu_stats": {"cpu_usage": {"total_usage": 1_000}, "system_cpu_usage": 10_000},
        "memory_stats": {"usage": 500, "limit": 1000, "stats": {"inactive_file": 100}},
    }
    assert container_cpu_percent(stats) == 40.0
    assert container_mem(stats) == (400, 1000)
    assert container_cpu_percent({}) == 0.0


def test_build_proxmox_data():
    resources = [
        {
            "type": "node",
            "node": "pve",
            "status": "online",
            "cpu": 0.25,
            "maxcpu": 8,
            "mem": 8,
            "maxmem": 16,
            "disk": 10,
            "maxdisk": 100,
            "uptime": 3600,
        },
        {
            "type": "qemu",
            "vmid": 100,
            "name": "web",
            "node": "pve",
            "status": "running",
            "cpu": 0.5,
            "maxcpu": 2,
            "mem": 2,
            "maxmem": 4,
            "uptime": 60,
        },
        {"type": "lxc", "vmid": 200, "name": "dns", "node": "pve", "status": "stopped", "maxmem": 1},
        {"type": "qemu", "vmid": 9000, "name": "tpl", "node": "pve", "status": "stopped", "template": 1},
        {
            "type": "storage",
            "id": "storage/pve/local",
            "storage": "local",
            "status": "available",
            "disk": 5,
            "maxdisk": 50,
        },
        {
            "type": "storage",
            "id": "storage/pve/nfs",
            "storage": "nfs",
            "shared": 1,
            "status": "available",
            "disk": 20,
            "maxdisk": 200,
        },
    ]
    tasks = [
        {"upid": "U1", "type": "qmstart", "id": "100", "node": "pve", "starttime": 10, "endtime": 11, "status": "OK"},
        {"upid": "U2", "type": "vzdump", "id": "", "node": "pve", "starttime": 20},
        {
            "upid": "U3",
            "type": "vzstart",
            "id": "200",
            "node": "pve",
            "starttime": 5,
            "endtime": 6,
            "status": "command failed",
        },
    ]
    d = build_proxmox_data(resources, tasks, lambda n: "Proxmox VE 9.2.2", "10.0.0.1")
    assert len(d.hosts) == 1 and d.hosts[0].cpu == 25.0 and d.hosts[0].address == "10.0.0.1"
    assert d.hosts[0].vms == 1 and d.hosts[0].containers == 1 and d.hosts[0].vms_running == 1
    assert [g.name for g in d.guests] == ["web", "dns"]  # template exclu
    assert d.guests[0].cpu == 50.0 and d.guests[1].cpu == 0.0
    assert (d.storage_used, d.storage_total) == (25, 250)
    assert [t.status for t in d.tasks] == ["running", "ok", "error"]
    assert d.tasks[1].target == "VM 100" and d.tasks[2].target == "CT 200"
