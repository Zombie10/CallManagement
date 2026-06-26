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

from call_management.admin.auth_permissions import normalize_role
from call_management.admin.env_store import PROJECT_ROOT

SESSION_COOKIE = "cm_admin_session"
VALID_ROLES = frozenset({"super_admin", "admin", "playground", "viewer"})
PROTECTED_USERNAMES = frozenset({"admin"})


def _auth_db_path() -> Path:
    return Path(os.getenv("ADMIN_AUTH_DB_PATH", PROJECT_ROOT / "data" / "admin_auth.db"))


def _session_hours() -> int:
    return int(os.getenv("ADMIN_SESSION_HOURS", "168"))


@dataclass
class AdminUser:
    id: str
    username: str
    display_name: str
    role: str = "admin"
    tenant_id: str | None = None
    enabled: bool = True


def _connect() -> sqlite3.Connection:
    path = _auth_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _migrate_schema(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "role" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'")
    if "enabled" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1")
    if "tenant_id" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN tenant_id TEXT")


def init_auth_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'admin',
                enabled INTEGER NOT NULL DEFAULT 1,
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
        _migrate_schema(conn)
        conn.commit()


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat()


def _row_to_user(row: sqlite3.Row) -> AdminUser:
    enabled = bool(row["enabled"]) if "enabled" in row.keys() else True
    role = normalize_role(row["role"] if "role" in row.keys() else "admin")
    tenant_id = row["tenant_id"] if "tenant_id" in row.keys() else None
    return AdminUser(
        id=row["id"],
        username=row["username"],
        display_name=row["display_name"],
        role=role,
        tenant_id=tenant_id,
        enabled=enabled,
    )


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def sync_admin_password_from_env() -> bool:
    """Apply ADMIN_PASSWORD from env to the bootstrap admin user. Returns True if updated."""
    password = os.getenv("ADMIN_PASSWORD", "").strip()
    username = os.getenv("ADMIN_USERNAME", "admin").strip().lower()
    if not password:
        return False

    with _connect() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if not row:
            return False
        new_hash = hash_password(password)
        if verify_password(password, row["password_hash"]):
            return False
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (new_hash, row["id"]),
        )
        conn.commit()
        return True


def ensure_bootstrap_user() -> AdminUser | None:
    """Create the first admin from env if the database is empty."""
    init_auth_db()
    username = os.getenv("ADMIN_USERNAME", "admin").strip().lower()
    password = os.getenv("ADMIN_PASSWORD", "").strip()

    with _connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()
        if row and row["c"] > 0:
            if sync_admin_password_from_env():
                print(f"\n🔐 Contraseña de '{username}' sincronizada desde ADMIN_PASSWORD en .env\n")
            elif not password:
                print(
                    f"\n⚠️  Usuario admin '{username}' ya existe.\n"
                    "   Define ADMIN_PASSWORD en .env y reinicia el admin para fijar tu contraseña.\n"
                    "   O ejecuta: uv run python -m call_management.admin.reset_password\n"
                )
            return get_user_by_username(username)

        if not password:
            password = secrets.token_urlsafe(16)
            print(
                f"\n🔐 Admin creado — usuario: {username} | contraseña temporal: {password}\n"
                "   Copia esta contraseña AHORA. Luego pon ADMIN_PASSWORD en .env y reinicia.\n"
            )

        user_id = secrets.token_hex(16)
        conn.execute(
            """
            INSERT INTO users (id, username, display_name, password_hash, role, enabled, tenant_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                username,
                "Administrador",
                hash_password(password),
                "super_admin",
                1,
                None,
                _iso(_utc_now()),
            ),
        )
        conn.commit()
        return AdminUser(
            id=user_id,
            username=username,
            display_name="Administrador",
            role="super_admin",
        )


def get_user_by_username(username: str) -> AdminUser | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, username, display_name, role, enabled, tenant_id FROM users WHERE username = ?",
            (username.strip().lower(),),
        ).fetchone()
        if not row:
            return None
        return _row_to_user(row)


def get_user_by_id(user_id: str) -> AdminUser | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, username, display_name, role, enabled, tenant_id FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        return _row_to_user(row)


def list_users() -> list[AdminUser]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, username, display_name, role, enabled, tenant_id FROM users ORDER BY created_at ASC"
        ).fetchall()
        return [_row_to_user(row) for row in rows]


def create_user(
    *,
    username: str,
    password: str,
    display_name: str,
    role: str = "playground",
    tenant_id: str | None = None,
) -> AdminUser:
    init_auth_db()
    uname = username.strip().lower()
    if not uname:
        raise ValueError("El nombre de usuario es obligatorio")
    if len(password) < 8:
        raise ValueError("La contraseña debe tener al menos 8 caracteres")
    role = normalize_role(role)
    if role == "admin" and uname not in PROTECTED_USERNAMES:
        pass  # allow creating additional admins if needed

    with _connect() as conn:
        existing = conn.execute("SELECT id FROM users WHERE username = ?", (uname,)).fetchone()
        if existing:
            raise ValueError(f"El usuario '{uname}' ya existe")
        user_id = secrets.token_hex(16)
        conn.execute(
            """
            INSERT INTO users (id, username, display_name, password_hash, role, enabled, tenant_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                uname,
                display_name.strip() or uname,
                hash_password(password),
                role,
                1,
                tenant_id,
                _iso(_utc_now()),
            ),
        )
        conn.commit()
    return AdminUser(
        id=user_id,
        username=uname,
        display_name=display_name.strip() or uname,
        role=role,
        tenant_id=tenant_id,
    )


def update_user(
    user_id: str,
    *,
    display_name: str | None = None,
    role: str | None = None,
    enabled: bool | None = None,
    password: str | None = None,
) -> AdminUser:
    user = get_user_by_id(user_id)
    if not user:
        raise ValueError("Usuario no encontrado")

    updates: list[str] = []
    params: list[Any] = []

    if display_name is not None:
        updates.append("display_name = ?")
        params.append(display_name.strip() or user.username)
    if role is not None:
        new_role = normalize_role(role)
        if user.username in PROTECTED_USERNAMES and new_role != "admin":
            raise ValueError("No se puede cambiar el rol del usuario admin principal")
        updates.append("role = ?")
        params.append(new_role)
    if enabled is not None:
        if user.username in PROTECTED_USERNAMES and not enabled:
            raise ValueError("No se puede desactivar el usuario admin principal")
        updates.append("enabled = ?")
        params.append(1 if enabled else 0)
    if password is not None:
        if len(password) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        updates.append("password_hash = ?")
        params.append(hash_password(password))

    if not updates:
        return user

    params.append(user_id)
    with _connect() as conn:
        conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    updated = get_user_by_id(user_id)
    assert updated is not None
    return updated


def delete_user(user_id: str) -> None:
    user = get_user_by_id(user_id)
    if not user:
        raise ValueError("Usuario no encontrado")
    if user.username in PROTECTED_USERNAMES:
        raise ValueError("No se puede eliminar el usuario admin principal")

    with _connect() as conn:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM webauthn_credentials WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()


def update_own_profile(user_id: str, *, display_name: str) -> AdminUser:
    return update_user(user_id, display_name=display_name)


def change_own_password(user_id: str, *, current_password: str, new_password: str) -> None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row or not verify_password(current_password, row["password_hash"]):
            raise ValueError("Contraseña actual incorrecta")
    update_user(user_id, password=new_password)


def delete_user_credential(user_id: str, credential_row_id: str) -> None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id FROM webauthn_credentials WHERE id = ? AND user_id = ?",
            (credential_row_id, user_id),
        ).fetchone()
        if not row:
            raise ValueError("Passkey no encontrado")
        conn.execute("DELETE FROM webauthn_credentials WHERE id = ?", (credential_row_id,))
        conn.commit()


def verify_user_password(username: str, password: str) -> AdminUser | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, username, display_name, password_hash FROM users WHERE username = ?",
            (username.strip().lower(),),
        ).fetchone()
        if not row or not verify_password(password, row["password_hash"]):
            return None
        user = _row_to_user(row)
        if not user.enabled:
            return None
        return user


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
            SELECT s.expires_at, u.*
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
        user = _row_to_user(row)
        if not user.enabled:
            conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            conn.commit()
            return None
        return user


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