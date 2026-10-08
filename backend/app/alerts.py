"""Moteur d'alertes : règles évaluées à chaque collecte, alertes persistantes, envoi des notifications.

Cycle de vie : condition détectée → (durée minimale écoulée) → alerte « active » + notification
→ condition disparue → alerte « résolue » (+ notification de résolution si activée).
"""

from __future__ import annotations

import copy
import json
import logging
import threading
import time
import uuid
from dataclasses import dataclass

from app.db import Database
from app.notify import CHANNEL_TYPES, SECRET_FIELDS, SEVERITY_RANK, NotifyError, send
from app.schemas import Dashboard

log = logging.getLogger("novapanel.alerts")
SECRET_PLACEHOLDER = "__secret__"

SCHEMA = """
CREATE TABLE IF NOT EXISTS alerts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    key           TEXT NOT NULL,
    rule          TEXT NOT NULL,
    severity      TEXT NOT NULL,
    title         TEXT NOT NULL,
    detail        TEXT NOT NULL DEFAULT '',
    target        TEXT NOT NULL DEFAULT '',
    started_at    INTEGER NOT NULL,
    resolved_at   INTEGER,
    acknowledged  INTEGER NOT NULL DEFAULT 0,
    ack_by        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS alerts_active ON alerts(resolved_at);
CREATE INDEX IF NOT EXISTS alerts_key ON alerts(key);
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

DEFAULT_CONFIG: dict = {
    "lang": "fr",
    "notify_resolved": True,
    "public_url": "",
    "rules": {
        "node_offline": {"enabled": True},
        "source_error": {"enabled": True, "minutes": 2},
        "cpu": {"enabled": True, "threshold": 90, "minutes": 5},
        "memory": {"enabled": True, "threshold": 90, "minutes": 5},
        "storage": {"enabled": True, "warning": 85, "critical": 95},
        "storage_unavailable": {"enabled": True, "minutes": 5},
        "backup_failed": {"enabled": True},
        "container_unhealthy": {"enabled": True, "minutes": 2},
        "uncovered_guests": {"enabled": True},
        "snapshot_age": {"enabled": True, "days": 30},
    },
    "channels": [],
}

T = {
    "fr": {
        "node_offline": ("Nœud hors ligne : {name}", "Le nœud Proxmox {name} ne répond plus."),
        "source_error": ("Source injoignable : {name}", "NovaPanel n'arrive plus à joindre {name} : {detail}"),
        "cpu": ("CPU élevé sur {name} ({value} %)", "Utilisation CPU au-dessus de {threshold} % depuis {minutes} min."),
        "memory": (
            "Mémoire saturée sur {name} ({value} %)",
            "Utilisation mémoire au-dessus de {threshold} % depuis {minutes} min.",
        ),
        "storage": ("Stockage presque plein : {name} ({value} %)", "{used} utilisés sur {total} ({host})."),
        "storage_unavailable": ("Stockage indisponible : {name}", "Le stockage {name} ({host}) est hors ligne."),
        "backup_failed": ("Sauvegarde en échec : {target}", "La tâche vzdump sur {host} a échoué ({when})."),
        "container_unhealthy": ("Conteneur en mauvaise santé : {name}", "Healthcheck « unhealthy » sur {host}."),
        "uncovered_guests": ("{count} invité(s) sans sauvegarde planifiée", "{names}"),
        "snapshot_age": (
            "{count} snapshot(s) de plus de {days} jours",
            "Les vieux snapshots ralentissent les disques et consomment de l'espace : {names}",
        ),
        "test": ("Notification de test", "Si vous lisez ceci, le canal « {name} » fonctionne."),
    },
    "en": {
        "node_offline": ("Node offline: {name}", "Proxmox node {name} is not responding."),
        "source_error": ("Source unreachable: {name}", "NovaPanel cannot reach {name}: {detail}"),
        "cpu": ("High CPU on {name} ({value}%)", "CPU usage above {threshold}% for {minutes} min."),
        "memory": ("Memory pressure on {name} ({value}%)", "Memory usage above {threshold}% for {minutes} min."),
        "storage": ("Storage almost full: {name} ({value}%)", "{used} used of {total} ({host})."),
        "storage_unavailable": ("Storage unavailable: {name}", "Storage {name} ({host}) is offline."),
        "backup_failed": ("Backup failed: {target}", "The vzdump task on {host} failed ({when})."),
        "container_unhealthy": ("Unhealthy container: {name}", "Healthcheck reports “unhealthy” on {host}."),
        "uncovered_guests": ("{count} guest(s) without scheduled backup", "{names}"),
        "snapshot_age": (
            "{count} snapshot(s) older than {days} days",
            "Old snapshots slow down disks and waste space: {names}",
        ),
        "test": ("Test notification", "If you can read this, channel “{name}” works."),
    },
}


def _gib(b: int) -> str:
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if b < 1024 or unit == "TiB":
            return f"{b:.1f} {unit}" if unit != "B" else f"{b} B"
        b /= 1024
    return str(b)


@dataclass
class Condition:
    key: str
    rule: str
    severity: str
    params: dict
    target: str
    min_seconds: int = 0


class AlertService:
    def __init__(self, db: Database):
        self.db = db
        db._conn().executescript(SCHEMA)
        self._pending: dict[str, float] = {}  # clé → première détection
        self._lock = threading.Lock()
        self.extras: dict = {}  # données lentes (sauvegardes, snapshots) fournies par le collecteur

    # ── configuration ────────────────────────────────────────
    def get_config(self) -> dict:
        with self.db.connect() as c:
            row = c.execute("SELECT value FROM settings WHERE key = 'alerts'").fetchone()
        cfg = copy.deepcopy(DEFAULT_CONFIG)
        if row:
            saved = json.loads(row["value"])
            for k, v in saved.items():
                if k == "rules":
                    for rk, rv in v.items():
                        if rk in cfg["rules"]:
                            cfg["rules"][rk].update(rv)
                else:
                    cfg[k] = v
        return cfg

    def public_config(self) -> dict:
        """Configuration renvoyée au navigateur : secrets masqués."""
        cfg = self.get_config()
        for ch in cfg["channels"]:
            for f in SECRET_FIELDS.get(ch["type"], ()):
                if ch["config"].get(f):
                    ch["config"][f] = SECRET_PLACEHOLDER
        return cfg

    def save_config(self, new: dict) -> dict:
        old = {ch["id"]: ch for ch in self.get_config()["channels"]}
        channels = []
        for ch in new.get("channels", []):
            if ch.get("type") not in CHANNEL_TYPES:
                raise ValueError("invalid_channel_type")
            ch = {
                "id": ch.get("id") or uuid.uuid4().hex[:10],
                "type": ch["type"],
                "name": str(ch.get("name") or ch["type"])[:60],
                "enabled": bool(ch.get("enabled", True)),
                "min_severity": ch.get("min_severity") if ch.get("min_severity") in SEVERITY_RANK else "warning",
                "config": {k: str(v)[:500] for k, v in (ch.get("config") or {}).items()},
            }
            # Secret non modifié côté interface → on garde l'ancienne valeur
            for f in SECRET_FIELDS.get(ch["type"], ()):
                if ch["config"].get(f) == SECRET_PLACEHOLDER:
                    ch["config"][f] = (old.get(ch["id"], {}).get("config") or {}).get(f, "")
            channels.append(ch)
        rules = copy.deepcopy(DEFAULT_CONFIG["rules"])
        for rk, rv in (new.get("rules") or {}).items():
            if rk in rules:
                for k, v in rv.items():
                    if k in rules[rk]:
                        rules[rk][k] = bool(v) if k == "enabled" else max(0, min(int(v), 100000))
        cfg = {
            "lang": new.get("lang") if new.get("lang") in ("fr", "en") else "fr",
            "notify_resolved": bool(new.get("notify_resolved", True)),
            "public_url": str(new.get("public_url") or "")[:300],
            "rules": rules,
            "channels": channels,
        }
        with self.db.connect() as c:
            c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('alerts', ?)", (json.dumps(cfg),))
        return self.public_config()

    # ── lecture ──────────────────────────────────────────────
    def list_alerts(self, active_only: bool, limit: int = 200) -> list[dict]:
        sql = "SELECT * FROM alerts" + (" WHERE resolved_at IS NULL" if active_only else "")
        sql += " ORDER BY (resolved_at IS NULL) DESC, started_at DESC LIMIT ?"
        with self.db.connect() as c:
            return [dict(r) | {"acknowledged": bool(r["acknowledged"])} for r in c.execute(sql, (limit,))]

    def acknowledge(self, alert_id: int, username: str) -> bool:
        with self.db.connect() as c:
            cur = c.execute("UPDATE alerts SET acknowledged = 1, ack_by = ? WHERE id = ?", (username, alert_id))
            return cur.rowcount > 0

    # ── évaluation ───────────────────────────────────────────
    def conditions(self, snap: Dashboard, cfg: dict) -> list[Condition]:
        r = cfg["rules"]
        out: list[Condition] = []
        now = time.time()
        if r["node_offline"]["enabled"]:
            for h in snap.hosts:
                if h.kind == "proxmox" and h.status == "offline":
                    out.append(Condition(f"node_offline:{h.id}", "node_offline", "critical", {"name": h.name}, h.name))
        if r["source_error"]["enabled"]:
            for s in snap.sources:
                if s.mode == "error":
                    out.append(
                        Condition(
                            f"source_error:{s.kind}:{s.name}",
                            "source_error",
                            "critical",
                            {"name": s.name, "detail": s.detail},
                            s.name,
                            r["source_error"]["minutes"] * 60,
                        )
                    )
        for metric in ("cpu", "memory"):
            rule = r[metric]
            if not rule["enabled"]:
                continue
            for h in snap.hosts:
                if h.status == "offline":
                    continue
                value = h.cpu if metric == "cpu" else (h.mem_used / h.mem_total * 100 if h.mem_total else 0)
                if value >= rule["threshold"]:
                    out.append(
                        Condition(
                            f"{metric}:{h.id}",
                            metric,
                            "warning",
                            {
                                "name": h.name,
                                "value": round(value),
                                "threshold": rule["threshold"],
                                "minutes": rule["minutes"],
                            },
                            h.name,
                            rule["minutes"] * 60,
                        )
                    )
        if r["storage"]["enabled"]:
            for st in snap.storages:
                if st.status != "available" or not st.total:
                    continue
                pct = st.used / st.total * 100
                sev = (
                    "critical"
                    if pct >= r["storage"]["critical"]
                    else "warning"
                    if pct >= r["storage"]["warning"]
                    else None
                )
                if sev:
                    out.append(
                        Condition(
                            f"storage:{st.id}",
                            "storage",
                            sev,
                            {
                                "name": st.name,
                                "value": round(pct),
                                "used": _gib(st.used),
                                "total": _gib(st.total),
                                "host": st.host,
                            },
                            st.name,
                        )
                    )
        if r["storage_unavailable"]["enabled"]:
            for st in snap.storages:
                if st.status == "unavailable":
                    out.append(
                        Condition(
                            f"storage_unavailable:{st.id}",
                            "storage_unavailable",
                            "warning",
                            {"name": st.name, "host": st.host},
                            st.name,
                            r["storage_unavailable"]["minutes"] * 60,
                        )
                    )
        if r["backup_failed"]["enabled"]:
            for t in snap.tasks:
                if t.type == "vzdump" and t.status == "error" and now - t.started_at < 86400:
                    when = time.strftime("%d/%m %H:%M", time.localtime(t.started_at))
                    out.append(
                        Condition(
                            f"backup_failed:{t.id}",
                            "backup_failed",
                            "critical",
                            {"target": t.target, "host": t.host, "when": when},
                            t.target,
                        )
                    )
        if r["container_unhealthy"]["enabled"]:
            for g in snap.guests:
                if g.type == "docker" and g.health == "unhealthy":
                    out.append(
                        Condition(
                            f"container_unhealthy:{g.host}:{g.name}",
                            "container_unhealthy",
                            "warning",
                            {"name": g.name, "host": g.host},
                            g.name,
                            r["container_unhealthy"]["minutes"] * 60,
                        )
                    )
        uncovered = self.extras.get("not_backed_up")
        if r["uncovered_guests"]["enabled"] and uncovered:
            names = ", ".join(f"{x['vmid']} {x['name']}" for x in uncovered[:15]) + ("…" if len(uncovered) > 15 else "")
            out.append(
                Condition(
                    "uncovered_guests", "uncovered_guests", "info", {"count": len(uncovered), "names": names}, "backups"
                )
            )
        snaps = self.extras.get("snapshots")
        if r["snapshot_age"]["enabled"] and snaps:
            limit = r["snapshot_age"]["days"] * 86400
            old = [s for s in snaps if s.get("snaptime") and now - s["snaptime"] > limit]
            if old:
                names = ", ".join(f"{s['guest_name']}@{s['name']}" for s in old[:10]) + ("…" if len(old) > 10 else "")
                out.append(
                    Condition(
                        "snapshot_age",
                        "snapshot_age",
                        "info",
                        {"count": len(old), "days": r["snapshot_age"]["days"], "names": names},
                        "snapshots",
                    )
                )
        return out

    def evaluate(self, snap: Dashboard) -> None:
        cfg = self.get_config()
        lang = cfg["lang"]
        now = int(time.time())
        conds = {c.key: c for c in self.conditions(snap, cfg)}
        to_notify: list[tuple[dict, bool]] = []
        with self._lock, self.db.connect() as c:
            active = {r["key"]: dict(r) for r in c.execute("SELECT * FROM alerts WHERE resolved_at IS NULL")}
            # Conditions temporisées : on attend la durée minimale avant d'alerter
            for k in list(self._pending):
                if k not in conds:
                    del self._pending[k]
            for key, cond in conds.items():
                if key in active:
                    continue
                first = self._pending.setdefault(key, now)
                if now - first < cond.min_seconds:
                    continue
                title_t, detail_t = T[lang][cond.rule]
                title, detail = title_t.format(**cond.params), detail_t.format(**cond.params)
                cur = c.execute(
                    "INSERT INTO alerts (key, rule, severity, title, detail, target, started_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (key, cond.rule, cond.severity, title, detail, cond.target, now),
                )
                self._pending.pop(key, None)
                to_notify.append(
                    (
                        {
                            "id": cur.lastrowid,
                            "severity": cond.severity,
                            "title": title,
                            "detail": detail,
                            "rule": cond.rule,
                            "target": cond.target,
                        },
                        False,
                    )
                )
                log.warning("Alerte [%s] %s", cond.severity, title)
            for key, row in active.items():
                if key not in conds:
                    c.execute("UPDATE alerts SET resolved_at = ? WHERE id = ?", (now, row["id"]))
                    log.info("Alerte résolue : %s", row["title"])
                    if cfg["notify_resolved"]:
                        to_notify.append(
                            (
                                {
                                    "id": row["id"],
                                    "severity": row["severity"],
                                    "title": row["title"],
                                    "detail": row["detail"],
                                    "rule": row["rule"],
                                    "target": row["target"],
                                },
                                True,
                            )
                        )
            c.execute("DELETE FROM alerts WHERE resolved_at IS NOT NULL AND resolved_at < ?", (now - 90 * 86400,))
        if to_notify:
            threading.Thread(target=self._dispatch, args=(cfg, to_notify), daemon=True, name="notify").start()

    def _dispatch(self, cfg: dict, items: list[tuple[dict, bool]]) -> None:
        url = cfg.get("public_url") or ""
        for alert, resolved in items:
            msg = {**alert, "resolved": resolved, "url": f"{url.rstrip('/')}/alerts" if url else ""}
            if resolved:
                msg["title"] = ("Résolu : " if cfg["lang"] == "fr" else "Resolved: ") + alert["title"]
            for ch in cfg["channels"]:
                if not ch.get("enabled") or SEVERITY_RANK[alert["severity"]] < SEVERITY_RANK[ch["min_severity"]]:
                    continue
                try:
                    send(ch, msg)
                except NotifyError as exc:
                    log.warning("Notification « %s » (%s) en échec : %s", ch["name"], ch["type"], exc)

    def test_channel(self, channel_id: str) -> None:
        cfg = self.get_config()
        ch = next((c for c in cfg["channels"] if c["id"] == channel_id), None)
        if ch is None:
            raise KeyError(channel_id)
        title, detail = T[cfg["lang"]]["test"]
        send(
            ch,
            {
                "severity": "info",
                "title": title,
                "detail": detail.format(name=ch["name"]),
                "resolved": False,
                "url": cfg.get("public_url") or "",
            },
        )
