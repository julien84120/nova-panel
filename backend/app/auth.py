"""Authentification : mots de passe Argon2id, sessions serveur (cookie HttpOnly), anti-bruteforce.

- Le cookie ne contient qu'un jeton aléatoire ; seule son empreinte SHA-256 est stockée en base.
- Session : expiration absolue (NOVA_SESSION_DAYS) + expiration d'inactivité (NOVA_SESSION_IDLE_HOURS).
- CSRF : cookie SameSite=Strict + en-tête obligatoire `X-Nova-Request` sur les requêtes qui modifient l'état
  (un site tiers ne peut pas l'envoyer sans pré-vol CORS, que l'API n'autorise pas).
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import threading
import time
from dataclasses import dataclass

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.config import Settings
from app.db import Database

log = logging.getLogger("novapanel.auth")

COOKIE_NAME = "nova_session"
CSRF_HEADER = "x-nova-request"
MIN_PASSWORD_LENGTH = 10
_hasher = PasswordHasher()  # Argon2id, paramètres recommandés par argon2-cffi
# Empreinte factice : vérifiée quand l'utilisateur n'existe pas, pour un temps de réponse constant
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


ROLES = ("viewer", "operator", "admin")
ROLE_RANK = {r: i for i, r in enumerate(ROLES)}


@dataclass
class User:
    id: int
    username: str
    role: str = "admin"

    def has(self, role: str) -> bool:
        return ROLE_RANK.get(self.role, -1) >= ROLE_RANK[role]


class AuthError(Exception):
    def __init__(self, code: str, status: int = 400, retry_after: int | None = None):
        super().__init__(code)
        self.code = code
        self.status = status
        self.retry_after = retry_after


def validate_username(username: str) -> str:
    username = username.strip()
    if not (3 <= len(username) <= 32) or not all(c.isalnum() or c in "._-" for c in username):
        raise AuthError("invalid_username")
    return username


def validate_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise AuthError("password_too_short")
    if len(password) > 256:
        raise AuthError("password_too_long")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class RateLimiter:
    """Verrouillage progressif par (IP, identifiant) et par IP, en mémoire."""

    def __init__(self, max_failures: int = 5, base_lock: int = 60, max_lock: int = 3600):
        self.max_failures = max_failures
        self.base_lock = base_lock
        self.max_lock = max_lock
        self._fails: dict[str, tuple[int, float]] = {}  # clé → (échecs, verrouillé jusqu'à)
        self._lock = threading.Lock()

    def _keys(self, ip: str, username: str) -> list[str]:
        return [f"ip:{ip}", f"user:{ip}:{username.lower()}"]

    def check(self, ip: str, username: str) -> None:
        now = time.time()
        with self._lock:
            for key in self._keys(ip, username):
                _, until = self._fails.get(key, (0, 0))
                if until > now:
                    raise AuthError("too_many_attempts", 429, retry_after=int(until - now) + 1)

    def failure(self, ip: str, username: str) -> None:
        now = time.time()
        with self._lock:
            for i, key in enumerate(self._keys(ip, username)):
                count, _ = self._fails.get(key, (0, 0))
                count += 1
                limit = self.max_failures * (4 if i == 0 else 1)  # l'IP seule tolère plus d'erreurs
                until = 0.0
                if count >= limit:
                    until = now + min(self.base_lock * 2 ** (count - limit), self.max_lock)
                self._fails[key] = (count, until)

    def success(self, ip: str, username: str) -> None:
        with self._lock:
            self._fails.pop(self._keys(ip, username)[1], None)


class AuthService:
    def __init__(self, db: Database, settings: Settings):
        self.db = db
        self.settings = settings
        self.limiter = RateLimiter()
        self._setup_token: str | None = None

    # ── utilisateurs ─────────────────────────────────────────
    def user_count(self) -> int:
        with self.db.connect() as c:
            return c.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    def setup_required(self) -> bool:
        return self.user_count() == 0

    def create_user(self, username: str, password: str, role: str = "admin") -> User:
        username = validate_username(username)
        validate_password(password)
        if role not in ROLES:
            raise AuthError("invalid_role")
        now = int(time.time())
        try:
            with self.db.connect() as c:
                cur = c.execute(
                    "INSERT INTO users (username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    (username, _hasher.hash(password), role, now, now),
                )
                return User(id=cur.lastrowid, username=username, role=role)
        except Exception as exc:
            if "UNIQUE" in str(exc):
                raise AuthError("username_taken", 409) from exc
            raise

    def set_password(self, username: str, password: str) -> None:
        validate_password(password)
        with self.db.connect() as c:
            row = c.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
            if not row:
                raise AuthError("user_not_found", 404)
            c.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (_hasher.hash(password), int(time.time()), row["id"]),
            )
            c.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))

    def list_users(self) -> list[str]:
        with self.db.connect() as c:
            return [r["username"] for r in c.execute("SELECT username FROM users ORDER BY id")]

    def users(self) -> list[dict]:
        with self.db.connect() as c:
            rows = c.execute(
                "SELECT u.id, u.username, u.role, u.disabled, u.created_at, u.last_login,"
                " (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions"
                " FROM users u ORDER BY u.id",
                (int(time.time()),),
            ).fetchall()
        return [{**dict(r), "disabled": bool(r["disabled"])} for r in rows]

    def _get(self, c, user_id: int):
        row = c.execute("SELECT id, username, role, disabled FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise AuthError("user_not_found", 404)
        return row

    def _admins_left(self, c, excluding: int) -> int:
        return c.execute(
            "SELECT COUNT(*) FROM users WHERE role = 'admin' AND disabled = 0 AND id != ?", (excluding,)
        ).fetchone()[0]

    def update_user(
        self,
        actor: User,
        user_id: int,
        role: str | None = None,
        disabled: bool | None = None,
        password: str | None = None,
    ) -> dict:
        """Modification par un administrateur. Garde-fous : jamais sur soi-même (rôle, désactivation),
        et il reste toujours au moins un administrateur actif."""
        if role is not None and role not in ROLES:
            raise AuthError("invalid_role")
        if password is not None:
            validate_password(password)
        with self.db.connect() as c:
            row = self._get(c, user_id)
            demote = role is not None and role != "admin"
            if user_id == actor.id and (demote or disabled):
                raise AuthError("cannot_modify_self", 409)
            if (
                row["role"] == "admin"
                and not row["disabled"]
                and (demote or disabled)
                and not self._admins_left(c, user_id)
            ):
                raise AuthError("last_admin", 409)
            now = int(time.time())
            if role is not None:
                c.execute("UPDATE users SET role = ?, updated_at = ? WHERE id = ?", (role, now, user_id))
            if disabled is not None:
                c.execute("UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?", (int(disabled), now, user_id))
            if password is not None:
                c.execute(
                    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                    (_hasher.hash(password), now, user_id),
                )
            # Toute modification de droits ou de mot de passe ferme les sessions ouvertes de ce compte
            if role is not None and role != row["role"] or disabled or password is not None:
                c.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        return next(u for u in self.users() if u["id"] == user_id)

    def delete_user(self, actor: User, user_id: int) -> str:
        with self.db.connect() as c:
            row = self._get(c, user_id)
            if user_id == actor.id:
                raise AuthError("cannot_modify_self", 409)
            if row["role"] == "admin" and not row["disabled"] and not self._admins_left(c, user_id):
                raise AuthError("last_admin", 409)
            c.execute("DELETE FROM users WHERE id = ?", (user_id,))
        return row["username"]

    # ── premier lancement ────────────────────────────────────
    def setup_token(self) -> str:
        """Jeton à usage unique affiché dans les logs tant qu'aucun compte n'existe."""
        if self._setup_token is None:
            self._setup_token = secrets.token_urlsafe(18)
        return self._setup_token

    def complete_setup(self, token: str, username: str, password: str, ip: str) -> User:
        self.limiter.check(ip, "__setup__")
        if not self.setup_required():
            raise AuthError("setup_done", 409)
        if not self._setup_token or not secrets.compare_digest(token.strip(), self._setup_token):
            self.limiter.failure(ip, "__setup__")
            raise AuthError("invalid_setup_token", 403)
        user = self.create_user(username, password)
        self._setup_token = None
        log.info("Compte administrateur « %s » créé via l'assistant", user.username)
        return user

    # ── connexion / sessions ─────────────────────────────────
    def authenticate(self, username: str, password: str, ip: str) -> User:
        self.limiter.check(ip, username)
        with self.db.connect() as c:
            row = c.execute(
                "SELECT id, username, password_hash, role, disabled FROM users WHERE username = ?", (username,)
            ).fetchone()
        try:
            _hasher.verify(row["password_hash"] if row else _DUMMY_HASH, password)
            if not row:
                raise VerifyMismatchError
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            self.limiter.failure(ip, username)
            log.warning("Échec de connexion pour « %s » depuis %s", username, ip)
            raise AuthError("invalid_credentials", 401) from None
        self.limiter.success(ip, username)
        if row["disabled"]:
            # Mot de passe correct mais compte désactivé : message explicite (le mot de passe est déjà prouvé)
            raise AuthError("account_disabled", 403)
        with self.db.connect() as c:
            c.execute("UPDATE users SET last_login = ? WHERE id = ?", (int(time.time()), row["id"]))
            if _hasher.check_needs_rehash(row["password_hash"]):
                c.execute("UPDATE users SET password_hash = ? WHERE id = ?", (_hasher.hash(password), row["id"]))
        return User(id=row["id"], username=row["username"], role=row["role"])

    def create_session(self, user: User, ip: str, user_agent: str) -> str:
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        with self.db.connect() as c:
            c.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
            c.execute(
                "INSERT INTO sessions (token_hash, user_id, created_at, last_seen, expires_at, ip, user_agent)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    _token_hash(token),
                    user.id,
                    now,
                    now,
                    now + self.settings.nova_session_days * 86400,
                    ip,
                    user_agent[:200],
                ),
            )
        return token

    def session_user(self, token: str | None) -> User | None:
        if not token:
            return None
        now = int(time.time())
        idle = self.settings.nova_session_idle_hours * 3600
        th = _token_hash(token)
        with self.db.connect() as c:
            row = c.execute(
                "SELECT s.last_seen, s.expires_at, u.id, u.username, u.role FROM sessions s"
                " JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.disabled = 0",
                (th,),
            ).fetchone()
            if not row:
                return None
            if row["expires_at"] < now or row["last_seen"] + idle < now:
                c.execute("DELETE FROM sessions WHERE token_hash = ?", (th,))
                return None
            if now - row["last_seen"] > 60:  # limite les écritures
                c.execute("UPDATE sessions SET last_seen = ? WHERE token_hash = ?", (now, th))
        return User(id=row["id"], username=row["username"], role=row["role"])

    def revoke(self, token: str | None) -> None:
        if token:
            with self.db.connect() as c:
                c.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))

    def change_password(self, user: User, current: str, new: str, ip: str) -> None:
        self.authenticate(user.username, current, ip)
        self.set_password(user.username, new)
