"""Collecteur central : interroge périodiquement chaque source et garde le dernier instantané en mémoire.

Les routes de l'API lisent uniquement cet instantané → réponses instantanées, et Proxmox / l'hôte SSH
ne sont jamais sollicités plus d'une fois par intervalle, quel que soit le nombre d'onglets ouverts.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections import deque

from app.config import Settings
from app.metrics import MetricsStore
from app.schemas import Dashboard, Guest, Host, SourceStatus, Storage, Summary, Task, UsagePoint
from app.services import demo
from app.services.docker_host import DockerCollector
from app.services.proxmox import ProxmoxCollector

log = logging.getLogger("novapanel.collector")
HISTORY_SECONDS = 3600


class Collector:
    def __init__(self, settings: Settings, metrics: MetricsStore | None = None, alerts=None):
        self.settings = settings
        self.metrics = metrics
        self.alerts = alerts
        self._extras_at = 0.0
        self._cache: dict[str, tuple[float, object]] = {}
        self.proxmox = ProxmoxCollector(settings) if settings.proxmox_enabled else None
        self.docker = DockerCollector(settings) if settings.docker_enabled else None
        self.history: deque[UsagePoint] = deque()
        self.snapshot: Dashboard | None = None
        self._lock = threading.Lock()
        self._task: asyncio.Task | None = None
        self._history_seeded = False
        self._last_seed_attempt = 0.0

    # ── cycle de vie ─────────────────────────────────────────
    async def start(self) -> None:
        await asyncio.to_thread(self._seed_history)
        await asyncio.to_thread(self.refresh)
        await asyncio.to_thread(self.run_alerts)
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _loop(self) -> None:
        while True:
            await asyncio.sleep(self.settings.nova_poll_interval)
            try:
                # Historique RRD indisponible au démarrage (droits, réseau) → nouvel essai toutes les 5 min
                if self.proxmox and not self._history_seeded and time.time() - self._last_seed_attempt > 300:
                    await asyncio.to_thread(self._seed_history)
                await asyncio.to_thread(self.refresh)
                await asyncio.to_thread(self.run_alerts)
            except Exception:  # noqa: BLE001 — le collecteur ne doit jamais s'arrêter
                log.exception("refresh failed")

    # ── alertes ──────────────────────────────────────────────
    def slow_data(self) -> dict:
        """Sauvegardes non couvertes et snapshots : coûteux, rafraîchis toutes les 15 min."""
        snap = self.snapshot
        out: dict = {}
        if snap is None:
            return out
        try:
            if self.proxmox is None:
                out["not_backed_up"] = demo.demo_backups()["not_backed_up"]
                out["snapshots"] = demo.demo_all_snapshots()
            else:
                out["not_backed_up"] = self.cached(
                    "backups", 60, lambda: self.proxmox.backups(snap.storages, snap.guests)
                )["not_backed_up"]
                out["snapshots"] = self.cached("snapshots", 120, lambda: self.proxmox.all_snapshots(snap.guests))
        except Exception as exc:  # noqa: BLE001
            log.warning("alert extras unavailable: %s", exc)
        return out

    def run_alerts(self) -> None:
        if self.alerts is None or self.snapshot is None:
            return
        try:
            if time.time() - self._extras_at > 900:
                self.alerts.extras = self.slow_data()
                self._extras_at = time.time()
            self.alerts.evaluate(self.snapshot)
        except Exception:  # noqa: BLE001
            log.exception("alert evaluation failed")

    def cached(self, key: str, ttl: float, fn):
        """Petit cache mémoire pour les lectures coûteuses (réseau, sauvegardes)."""
        hit = self._cache.get(key)
        if hit and time.time() - hit[0] < ttl:
            return hit[1]
        value = fn()
        self._cache[key] = (time.time(), value)
        return value

    def invalidate(self, prefix: str = "") -> None:
        for k in [k for k in self._cache if k.startswith(prefix)]:
            self._cache.pop(k, None)

    def _seed_history(self) -> None:
        self._last_seed_attempt = time.time()
        points: list[UsagePoint] = []
        if self.proxmox:
            try:
                points = self.proxmox.history()
                if self.metrics:
                    # Historique par nœud (RRD 1 h, 24 h, 7 j) → base locale, sans écraser les mesures existantes
                    for tf in ("hour", "day", "week"):
                        self.metrics.seed(self.proxmox.node_rrd_samples(tf))
                self._history_seeded = True
            except Exception as exc:  # noqa: BLE001
                hint = ""
                if "403" in str(exc):
                    hint = (
                        " — le jeton n'a pas Sys.Audit sur ce nœud. Avec la séparation des privilèges, "
                        "l'utilisateur ET le jeton doivent avoir le rôle PVEAuditor sur / (voir README)."
                    )
                log.warning("Proxmox RRD history unavailable: %s%s", exc, hint)
                return
        elif not self.docker:
            points = demo.demo_history()
        if self.metrics and (self.proxmox is None or self.docker is None):
            # Hôtes fictifs : historique synthétique d'une semaine (une seule fois)
            for host_id, samples in demo.demo_host_history(self.settings.docker_display_name).items():
                skip_pve = self.proxmox is not None and host_id.startswith("pve:")
                skip_docker = self.docker is not None and host_id.startswith("docker:")
                if not (skip_pve or skip_docker) and not self.metrics.has_data(host_id, int(time.time()) - 3600):
                    self.metrics.seed(samples)
        with self._lock:
            # Fusionne avec les points déjà collectés en direct, sans doublons
            merged = {p.t: p for p in [*points, *self.history]}
            self.history.clear()
            self.history.extend(merged[t] for t in sorted(merged))

    def refresh_soon(self, delays: tuple[float, ...] = (1.5, 5.0)) -> None:
        """Rafraîchit l'instantané peu après une action (le temps que l'état change côté source)."""

        def run():
            for d in delays:
                time.sleep(d)
                try:
                    self.refresh()
                except Exception:  # noqa: BLE001
                    log.exception("deferred refresh failed")

        threading.Thread(target=run, daemon=True, name="refresh-soon").start()

    # ── collecte ─────────────────────────────────────────────
    def refresh(self) -> Dashboard:
        with self._lock:
            hosts: list[Host] = []
            guests: list[Guest] = []
            tasks: list[Task] = []
            storages: list[Storage] = []
            sources: list[SourceStatus] = []
            storage_used = storage_total = 0

            if self.proxmox:
                try:
                    d = self.proxmox.collect()
                    hosts += d.hosts
                    guests += d.guests
                    tasks += d.tasks
                    storages += d.storages
                    storage_used, storage_total = d.storage_used, d.storage_total
                    sources.append(SourceStatus(name=self.settings.proxmox_host, kind="proxmox", mode="live"))
                except Exception as exc:  # noqa: BLE001
                    log.warning("Proxmox: %s", exc)
                    sources.append(
                        SourceStatus(name=self.settings.proxmox_host, kind="proxmox", mode="error", detail=_short(exc))
                    )
            else:
                d = demo.demo_proxmox()
                hosts += d.hosts
                guests += d.guests
                tasks += d.tasks
                storages += d.storages
                storage_used, storage_total = d.storage_used, d.storage_total
                sources.append(SourceStatus(name="Proxmox", kind="proxmox", mode="demo"))

            name = self.settings.docker_display_name
            if self.docker:
                try:
                    d = self.docker.collect()
                    if d.host:
                        hosts.append(d.host)
                        storage_used += d.host.disk_used
                        storage_total += d.host.disk_total
                    guests += d.guests
                    storages += d.storages
                    sources.append(SourceStatus(name=name, kind="docker", mode="live"))
                except Exception as exc:  # noqa: BLE001
                    log.warning("Docker/SSH: %s", exc)
                    sources.append(SourceStatus(name=name, kind="docker", mode="error", detail=_short(exc)))
            else:
                d = demo.demo_docker(name)
                hosts.append(d.host)
                guests += d.guests
                storages += d.storages
                storage_used += d.host.disk_used
                storage_total += d.host.disk_total
                sources.append(SourceStatus(name=name, kind="docker", mode="demo"))

            online = [h for h in hosts if h.status != "offline"]
            cores = sum(h.cores for h in online)
            cpu = round(sum(h.cpu * h.cores for h in online) / cores, 1) if cores else 0.0
            mem_used = sum(h.mem_used for h in online)
            mem_total = sum(h.mem_total for h in online)
            summary = Summary(
                cpu=cpu,
                cores=cores,
                mem_used=mem_used,
                mem_total=mem_total,
                disk_used=storage_used,
                disk_total=storage_total,
                guests_total=len(guests),
                guests_running=sum(g.status == "running" for g in guests),
            )

            now = int(time.time())
            if self.metrics:
                try:
                    self.metrics.add(
                        (h.id, now, h.cpu, round(h.mem_used / h.mem_total * 100, 1))
                        for h in hosts
                        if h.status != "offline" and h.mem_total
                    )
                except Exception:  # noqa: BLE001
                    log.exception("metrics write failed")
            if mem_total:
                self.history.append(UsagePoint(t=now, cpu=cpu, memory=round(mem_used / mem_total * 100, 1)))
            while self.history and self.history[0].t < now - HISTORY_SECONDS:
                self.history.popleft()

            self.snapshot = Dashboard(
                generated_at=now,
                demo=any(s.mode == "demo" for s in sources),
                sources=sources,
                summary=summary,
                hosts=hosts,
                guests=sorted(guests, key=lambda g: g.cpu, reverse=True),
                tasks=sorted(tasks, key=lambda t: t.started_at, reverse=True)[:50],
                storages=storages,
                history=list(self.history),
                actions_enabled=self.settings.nova_actions,
            )
            return self.snapshot


def _short(exc: Exception) -> str:
    msg = str(exc).splitlines()[0] if str(exc) else exc.__class__.__name__
    return msg[:200]
