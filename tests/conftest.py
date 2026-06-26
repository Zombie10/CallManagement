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


@pytest.fixture(autouse=True)
def isolated_platform_db(tmp_path, monkeypatch):
    """Isolate multi-tenant platform DB per test."""
    from call_management.tenancy.context import clear_crm_cache
    from call_management.tenancy.platform_store import reset_platform_store

    monkeypatch.setenv("PLATFORM_DB_PATH", str(tmp_path / "platform.db"))
    monkeypatch.setenv("TENANTS_DATA_ROOT", str(tmp_path / "tenants"))
    reset_platform_store()
    clear_crm_cache()
    yield
    reset_platform_store()
    clear_crm_cache()