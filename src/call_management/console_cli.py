"""Extra CLI flags for `call-management console` before LiveKit Typer parses argv."""

from __future__ import annotations

import os
import sys

_CUSTOM_FLAGS = frozenset(
    {
        "--agent",
        "-a",
        "--phone",
        "--customer",
        "--vip",
        "--quiet",
        "-q",
    }
)


def apply_console_cli_overrides(argv: list[str] | None = None) -> list[str]:
    """Parse custom flags, set env vars, return argv for LiveKit CLI."""
    args = list(argv if argv is not None else sys.argv)
    if len(args) < 2 or args[1] != "console":
        return args

    passthrough = [args[0], "console"]
    i = 2
    has_log_level = False

    while i < len(args):
        token = args[i]
        if token in ("--agent", "-a"):
            if i + 1 >= len(args):
                raise SystemExit("error: --agent requires a value (receptionist, support, sales, technical, escalation)")
            os.environ["CALL_INITIAL_AGENT"] = args[i + 1].strip().lower()
            i += 2
            continue
        if token == "--phone":
            if i + 1 >= len(args):
                raise SystemExit("error: --phone requires a value")
            os.environ["CALL_FROM_NUMBER"] = args[i + 1].strip()
            i += 2
            continue
        if token == "--customer":
            if i + 1 >= len(args):
                raise SystemExit("error: --customer requires a value")
            os.environ["CALL_CUSTOMER_NAME"] = args[i + 1].strip()
            i += 2
            continue
        if token == "--vip":
            os.environ["CALL_VIP"] = "true"
            i += 1
            continue
        if token in ("--quiet", "-q"):
            if "LIVEKIT_LOG_LEVEL" not in os.environ:
                os.environ["LIVEKIT_LOG_LEVEL"] = "INFO"
            os.environ["CALL_QUIET_CONSOLE"] = "true"
            i += 1
            continue
        if token == "--log-level":
            has_log_level = True
        passthrough.append(token)
        i += 1

    if not has_log_level and "LIVEKIT_LOG_LEVEL" not in os.environ:
        os.environ.setdefault("LIVEKIT_LOG_LEVEL", "INFO")

    return passthrough


def print_console_usage() -> None:
    print(
        """
Call Management — console options (in addition to LiveKit flags)

  call-management console [options]

  Custom flags:
    -a, --agent NAME     Start with agent: receptionist|banking_support|support|sales|technical|escalation
    --phone NUMBER       Simulate caller phone for CRM lookup (e.g. +15551234567)
    --customer NAME      Caller display name
    --vip                Route VIP callers per VIP_SKIP_RECEPTIONIST
    -q, --quiet          Less log noise (INFO level)

  LiveKit flags (see --help):
    --text               Text mode instead of microphone
    --log-level info     Control verbosity

  Examples:
    call-management console -a support -q
    call-management console --agent sales --phone +15559876543 --text
    call-management console --log-level warn
""".strip()
    )