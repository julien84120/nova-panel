"""Journal des actions effectuées depuis NovaPanel (qui, quoi, quand, résultat)."""

from __future__ import annotations

import time

from app.db import Database
from app.schemas import AuditEntry


class AuditLog:
    def __init__(self, db: Database):
        self.db = db

    def add(
        self, username: str, source: str, action: str, target: str, status: str, detail: str = "", ref: str = ""
    ) -> int:
        with self.db.connect() as c:
            cur = c.execute(
                "INSERT INTO audit_log (ts, username, source, action, target, status, detail, ref)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (int(time.time()), username, source, action, target, status, detail[:500], ref),
            )
            c.execute("DELETE FROM audit_log WHERE id <= (SELECT MAX(id) - 5000 FROM audit_log)")
            return cur.lastrowid

    def update(self, entry_id: int, status: str, detail: str = "") -> None:
        with self.db.connect() as c:
            c.execute("UPDATE audit_log SET status = ?, detail = ? WHERE id = ?", (status, detail[:500], entry_id))

    def update_by_ref(self, ref: str, status: str, detail: str = "") -> None:
        with self.db.connect() as c:
            c.execute(
                "UPDATE audit_log SET status = ?, detail = ? WHERE ref = ? AND status = 'running'",
                (status, detail[:500], ref),
            )

    def recent(self, limit: int = 100) -> list[AuditEntry]:
        with self.db.connect() as c:
            rows = c.execute(
                "SELECT id, ts, username, source, action, target, status, detail FROM audit_log"
                " ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [AuditEntry(**dict(r)) for r in rows]
