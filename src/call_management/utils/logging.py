"""Logging configuration helpers (optional, can be expanded)."""

import logging


def configure_logging(level: str = "INFO") -> None:
    """Basic logging setup for the call management package."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    )
