"""Historique des métriques par hôte, persistant (SQLite) — survit aux redémarrages.

Un point est enregistré à chaque collecte (NOVA_POLL_INTERVAL) pour chaque hôte en ligne, puis
regroupé à la lecture selon la plage demandée. Rétention : 8 jours.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Iterable

from app.db import Database

RETENTION = 8 * 86400
# plage → (durée, taille de regroupement en secondes)
RANGES = {"hour": (3600, 30), "day": (86400, 600), "week": (7 * 86400, 3600)}

SCHEMA = """
CREATE TABLE IF NOT EXISTS metrics (
    host_id TEXT NOT NULL,
    ts      INTEGER NOT NULL,
    cpu     REAL NOT NULL,
    mem     REAL NOT NULL,
    PRIMARY KEY (host_id, ts)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS metrics_ts ON metrics(ts);
"""


class MetricsStore:
    def __init__(self, db: Database):
        self.db = db
        db._conn().executescript(SCHEMA)
        self._last_prune = 0.0
        self._lock = threading.Lock()

    def add(self, samples: Iterable[tuple[str, int, float, float]]) -> None:
        """samples : (host_id, timestamp, cpu %, mémoire %)."""
        rows = list(samples)
        if not rows:
            return
        with self._lock, self.db.connect() as c:
            c.executemany("INSERT OR REPLACE INTO metrics (host_id, ts, cpu, mem) VALUES (?, ?, ?, ?)", rows)
            now = time.time()
            if now - self._last_prune > 3600:
                c.execute("DELETE FROM metrics WHERE ts < ?", (int(now - RETENTION),))
                self._last_prune = now

    def seed(self, samples: Iterable[tuple[str, int, float, float]]) -> int:
        """Ajoute des points historiques (RRD) sans écraser les mesures existantes."""
        rows = list(samples)
        if not rows:
            return 0
        with self._lock, self.db.connect() as c:
            before = c.total_changes
            c.executemany("INSERT OR IGNORE INTO metrics (host_id, ts, cpu, mem) VALUES (?, ?, ?, ?)", rows)
            return c.total_changes - before

    def has_data(self, host_id: str, since: int) -> bool:
        with self.db.connect() as c:
            return (
                c.execute("SELECT 1 FROM metrics WHERE host_id = ? AND ts >= ? LIMIT 1", (host_id, since)).fetchone()
                is not None
            )

    def query(self, range_: str, host_id: str | None = None) -> dict[str, list[dict]]:
        span, bucket = RANGES[range_]
        since = int(time.time()) - span
        sql = (
            "SELECT host_id, (ts / ?) * ? AS t, AVG(cpu) AS cpu, AVG(mem) AS mem FROM metrics WHERE ts >= ?"
            + (" AND host_id = ?" if host_id else "")
            + " GROUP BY host_id, t ORDER BY t"
        )
        params: list = [bucket, bucket, since] + ([host_id] if host_id else [])
        out: dict[str, list[dict]] = {}
        with self.db.connect() as c:
            for r in c.execute(sql, params):
                out.setdefault(r["host_id"], []).append(
                    {"t": r["t"], "cpu": round(r["cpu"], 1), "memory": round(r["mem"], 1)}
                )
        return out
