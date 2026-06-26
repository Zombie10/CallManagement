"""Shared pytest fixtures."""

from __future__ import annotations

import pytest


@pytest.fixture
def agent_profiles_file(tmp_path):
    return tmp_path / "agent_profiles.json"


@pytest.fixture(autouse=True)
def disable_admin_auth(monkeypatch):
    monkeypatch.setenv("ADMIN_AUTH_DISABLED", "true")


@pytest.fixture(autouse=True)
def isolated_agent_profiles(agent_profiles_file, monkeypatch):
    """Prevent tests from reading/writing the developer's local agent_profiles.json."""
    monkeypatch.setenv("AGENT_PROFILES_PATH", str(agent_profiles_file))