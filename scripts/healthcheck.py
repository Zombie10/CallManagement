"""Simple container health check for the Call Management agent package."""

from __future__ import annotations

import importlib
import sys


def main() -> int:
    modules = [
        "call_management.server",
        "call_management.config",
        "call_management.crm.database",
        "call_management.scheduling.calendar",
    ]
    for module in modules:
        importlib.import_module(module)
    print("healthcheck ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
