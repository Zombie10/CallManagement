"""Call Management System - LiveKit Agents powered contact center platform."""

__version__ = "0.1.0"

__all__ = ["server", "entrypoint", "__version__"]


def __getattr__(name: str):
    if name in {"server", "entrypoint"}:
        from call_management.server import entrypoint, server

        return server if name == "server" else entrypoint
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
