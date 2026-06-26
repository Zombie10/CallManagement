"""Multi-tenant platform: companies, agent instances, isolated CRM."""

from call_management.tenancy.context import TenantContext, get_tenant_context, resolve_crm_for_tenant
from call_management.tenancy.platform_store import (
    AgentInstance,
    AgentSchedule,
    PhoneRoute,
    Tenant,
    PlatformStore,
    get_platform_store,
)

__all__ = [
    "AgentInstance",
    "AgentSchedule",
    "PhoneRoute",
    "Tenant",
    "PlatformStore",
    "TenantContext",
    "get_platform_store",
    "get_tenant_context",
    "resolve_crm_for_tenant",
]