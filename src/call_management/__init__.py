"""Call Management System - LiveKit Agents powered contact center platform."""

__version__ = "0.1.0"

from call_management.server import entrypoint, server

__all__ = ["server", "entrypoint", "__version__"]
