"""Reset admin password from the command line."""

from __future__ import annotations

import argparse
import getpass
import os
import sys

from dotenv import load_dotenv

from call_management.admin.auth_store import ensure_bootstrap_user, hash_password, sync_admin_password_from_env


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Reset Call Management admin password")
    parser.add_argument("--username", default=os.getenv("ADMIN_USERNAME", "admin"))
    parser.add_argument("--password", help="New password (omit to prompt securely)")
    args = parser.parse_args()

    ensure_bootstrap_user()

    if args.password:
        password = args.password.strip()
    else:
        password = getpass.getpass("Nueva contraseña admin: ").strip()
        confirm = getpass.getpass("Confirmar contraseña: ").strip()
        if not password or password != confirm:
            print("Error: las contraseñas no coinciden o están vacías.", file=sys.stderr)
            raise SystemExit(1)

    if not password:
        print("Error: contraseña vacía.", file=sys.stderr)
        raise SystemExit(1)

    os.environ["ADMIN_USERNAME"] = args.username.strip().lower()
    os.environ["ADMIN_PASSWORD"] = password
    if sync_admin_password_from_env():
        print(f"✓ Contraseña actualizada para '{args.username.strip().lower()}'")
        print("  Añade ADMIN_PASSWORD a tu .env para que persista tras reinicios.")
    else:
        from call_management.admin.auth_store import _connect

        username = args.username.strip().lower()
        with _connect() as conn:
            row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
            if not row:
                print(f"Error: usuario '{username}' no encontrado.", file=sys.stderr)
                raise SystemExit(1)
            conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (hash_password(password), row["id"]),
            )
            conn.commit()
        print(f"✓ Contraseña actualizada para '{username}'")


if __name__ == "__main__":
    main()