"""Logging configuration helpers."""

from __future__ import annotations

import logging
import os


def configure_logging(level: str | None = None) -> logging.Logger:
    """Configure package logging and return the root call-management logger."""
    resolved = (level or os.getenv("LOG_LEVEL", "INFO")).upper()
    logging.basicConfig(
        level=getattr(logging, resolved, logging.INFO),
        format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
        force=True,
    )
    logger = logging.getLogger("call-management")
    logger.setLevel(getattr(logging, resolved, logging.INFO))
    return logger
