"""Per-user module permissions."""

from __future__ import annotations

import pytest

from call_management.admin.auth_permissions import (
    can_access_api,
    can_access_route,
    effective_modules,
    normalize_module_ids,
)


def test_effective_modules_custom_subset():
    mods = effective_modules("viewer", ["calls", "analytics"])
    assert mods == ["analytics", "calls"]


def test_custom_modules_cannot_exceed_role_ceiling():
    normalized = normalize_module_ids(["settings", "calls"], role="playground")
    assert normalized is None


def test_route_analytics_requires_module():
    assert not can_access_route("viewer", "/analytics", ["calls"])
    assert can_access_route("viewer", "/analytics", ["analytics", "calls"])


def test_api_reports_requires_analytics_module():
    assert not can_access_api("playground", "/api/reports/calls", ["playground"])
    assert can_access_api("viewer", "/api/reports/options", ["analytics"])


def test_api_recording_requires_recordings_module():
    assert not can_access_api("viewer", "/api/calls/call_1/recording", ["calls"])
    assert can_access_api("viewer", "/api/calls/call_1/recording", ["calls", "recordings"])
    assert not can_access_api("playground", "/api/calls/call_1/recording", ["playground"])


def test_playground_role_can_list_company_agents():
    assert can_access_api("playground", "/api/playground/agents", ["playground"])
    assert not can_access_api("playground", "/api/tenant-agents", ["playground"])


def test_admin_does_not_bypass_module_prefixes():
    assert can_access_api("admin", "/api/supervisor")
    assert can_access_api("admin", "/api/export/calls.csv")
    assert not can_access_api("admin", "/api/agents")
    assert can_access_api("admin", "/api/auth/users")
    assert not can_access_api("admin", "/api/auth/users", ["dashboard"])
    assert can_access_api("admin", "/api/auth/users", ["users"])


def test_operations_and_voice_preview_modules():
    assert can_access_api("viewer", "/api/operations/agents", ["operations"])
    assert not can_access_api("viewer", "/api/tenant-agents", ["operations"])
    assert can_access_api("admin", "/api/voice/preview", ["my_agents"])
    assert can_access_api("playground", "/api/voice/preview", ["playground"])
    assert not can_access_api("viewer", "/api/voice/preview", ["operations"])