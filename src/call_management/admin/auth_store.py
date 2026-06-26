"""SQLite store for admin users, sessions, and WebAuthn credentials."""

from __future__ import annotations

import json
import os
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import bcrypt

from call_management.admin.env_store import PROJECT_ROOT

SESSION_COOKIE = "cm_admin_session"


def _auth_db_path() -> Path:
    return Path(os.getenv("ADMIN_AUTH_DB_PATH", PROJECT_ROOT / "data" / "admin_auth.db"))


def _session_hours() -> int:
    return int(os.getenv("ADMIN_SESSION_HOURS", "168"))


@dataclass
class AdminUser:
    id: str
    username: str
    display_name: str


def _connect() -> sqlite3.Connection:
    path = _auth_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init_auth_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS webauthn_credentials (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                credential_id BLOB NOT NULL UNIQUE,
                public_key BLOB NOT NULL,
                sign_count INTEGER NOT NULL DEFAULT 0,
                transports TEXT,
                device_name TEXT,
                created_at TEXT NOT NULL,
                last_used_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS webauthn_challenges (
                id TEXT PRIMARY KEY,
                challenge BLOB NOT NULL,
                user_id TEXT,
                purpose TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
            """
        )


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def ensure_bootstrap_user() -> AdminUser | None:
    """Create the first admin from env if the database is empty."""
    init_auth_db()
    username = os.getenv("ADMIN_USERNAME", "admin").strip()
    password = os.getenv("ADMIN_PASSWORD", "").strip()

    with _connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()
        if row and row["c"] > 0:
            return get_user_by_username(username)

        if not password:
            password = secrets.token_urlsafe(16)
            print(
                f"\n🔐 Admin creado — usuario: {username} | contraseña temporal: {password}\n"
                "   Guárdala y configura ADMIN_PASSWORD en .env. Registra un passkey tras iniciar sesión.\n"
            )

        user_id = secrets.token_hex(16)
        username = username.lower()
        conn.execute(
            "INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, username, "Administrador", hash_password(password), _iso(_utc_now())),
        )
        conn.commit()
        return AdminUser(id=user_id, username=username, display_name="Administrador")


def get_user_by_username(username: str) -> AdminUser | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, username, display_name FROM users WHERE username = ?",
            (username.strip().lower(),),
        ).fetchone()
        if not row:
            return None
        return AdminUser(id=row["id"], username=row["username"], display_name=row["display_name"])


def get_user_by_id(user_id: str) -> AdminUser | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, username, display_name FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        return AdminUser(id=row["id"], username=row["username"], display_name=row["display_name"])


def verify_user_password(username: str, password: str) -> AdminUser | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, username, display_name, password_hash FROM users WHERE username = ?",
            (username.strip().lower(),),
        ).fetchone()
        if not row or not verify_password(password, row["password_hash"]):
            return None
        return AdminUser(id=row["id"], username=row["username"], display_name=row["display_name"])


def create_session(user_id: str) -> tuple[str, datetime]:
    session_id = secrets.token_urlsafe(32)
    expires = _utc_now() + timedelta(hours=_session_hours())
    with _connect() as conn:
        conn.execute(
            "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (session_id, user_id, _iso(expires), _iso(_utc_now())),
        )
        conn.commit()
    return session_id, expires


def get_session_user(session_id: str | None) -> AdminUser | None:
    if not session_id:
        return None
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT s.expires_at, u.id, u.username, u.display_name
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = ?
            """,
            (session_id,),
        ).fetchone()
        if not row:
            return None
        expires = datetime.fromisoformat(row["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if expires < _utc_now():
            conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            conn.commit()
            return None
        return AdminUser(id=row["id"], username=row["username"], display_name=row["display_name"])


def delete_session(session_id: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        conn.commit()


def store_challenge(*, challenge: bytes, purpose: str, user_id: str | None = None) -> str:
    challenge_id = secrets.token_urlsafe(16)
    expires = _utc_now() + timedelta(minutes=5)
    with _connect() as conn:
        conn.execute(
            "INSERT INTO webauthn_challenges (id, challenge, user_id, purpose, expires_at) VALUES (?, ?, ?, ?, ?)",
            (challenge_id, challenge, user_id, purpose, _iso(expires)),
        )
        conn.commit()
    return challenge_id


def pop_challenge(challenge_id: str, purpose: str) -> tuple[bytes, str | None] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT challenge, user_id, expires_at FROM webauthn_challenges WHERE id = ? AND purpose = ?",
            (challenge_id, purpose),
        ).fetchone()
        conn.execute("DELETE FROM webauthn_challenges WHERE id = ?", (challenge_id,))
        conn.commit()
        if not row:
            return None
        expires = datetime.fromisoformat(row["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if expires < _utc_now():
            return None
        return row["challenge"], row["user_id"]


def list_user_credentials(user_id: str) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, device_name, transports, created_at, last_used_at
            FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC
            """,
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def list_credentials_for_username(username: str) -> list[dict[str, Any]]:
    user = get_user_by_username(username)
    if not user:
        return []
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT credential_id, transports, sign_count, public_key
            FROM webauthn_credentials WHERE user_id = ?
            """,
            (user.id,),
        ).fetchall()
        return [dict(r) for r in rows]


def save_credential(
    *,
    user_id: str,
    credential_id: bytes,
    public_key: bytes,
    sign_count: int,
    transports: list[str] | None,
    device_name: str,
) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO webauthn_credentials
            (id, user_id, credential_id, public_key, sign_count, transports, device_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                secrets.token_hex(12),
                user_id,
                credential_id,
                public_key,
                sign_count,
                json.dumps(transports or []),
                device_name,
                _iso(_utc_now()),
            ),
        )
        conn.commit()


def get_credential_by_id(credential_id: bytes) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT c.*, u.username, u.display_name
            FROM webauthn_credentials c
            JOIN users u ON u.id = c.user_id
            WHERE c.credential_id = ?
            """,
            (credential_id,),
        ).fetchone()
        return dict(row) if row else None


def update_credential_sign_count(credential_row_id: str, sign_count: int) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE webauthn_credentials SET sign_count = ?, last_used_at = ? WHERE id = ?",
            (sign_count, _iso(_utc_now()), credential_row_id),
        )
        conn.commit()