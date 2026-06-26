"""Validate environment before running `dev` mode against LiveKit Cloud."""

from __future__ import annotations

import os
import sys

PLACEHOLDER_MARKERS = ("your-project", "AP...", "your_", "example.com", "changeme")


def _is_placeholder(value: str | None) -> bool:
    if not value or not value.strip():
        return True
    lower = value.lower()
    return any(marker.lower() in lower for marker in PLACEHOLDER_MARKERS)


def check_livekit_env() -> list[str]:
    """Return human-readable issues; empty list means credentials look configured."""
    issues: list[str] = []
    url = os.getenv("LIVEKIT_URL", "")
    key = os.getenv("LIVEKIT_API_KEY", "")
    secret = os.getenv("LIVEKIT_API_SECRET", "")

    if _is_placeholder(url):
        issues.append("LIVEKIT_URL still has the placeholder from .env.example")
    if _is_placeholder(key):
        issues.append("LIVEKIT_API_KEY is missing or still a placeholder")
    if _is_placeholder(secret):
        issues.append("LIVEKIT_API_SECRET is missing or still a placeholder")

    if url and not url.startswith(("wss://", "ws://")):
        issues.append("LIVEKIT_URL must start with wss:// or ws://")

    return issues


def print_dev_preflight() -> int:
    from dotenv import load_dotenv

    load_dotenv()
    issues = check_livekit_env()

    if not issues:
        print("✓ LiveKit credentials look configured. Starting dev worker...")
        return 0

    print("\n⚠️  LiveKit dev mode needs real Cloud credentials (not .env.example placeholders).\n")
    for issue in issues:
        print(f"  • {issue}")
    print("\nGet them from: https://cloud.livekit.io/ → Project → Settings → Keys")
    print("\nAlternative without LiveKit (text chat in browser):")
    print("  uv run call-management-admin  →  http://127.0.0.1:8080/playground")
    print("\nAlternative without LiveKit (local voice/text):")
    print("  uv run -m call_management.server console")
    print("  uv run -m call_management.server console --text")
    print("\nThe worker will keep retrying with 401 errors until credentials are fixed.\n")
    return 1


def main() -> None:
    raise SystemExit(print_dev_preflight())


if __name__ == "__main__":
    main()