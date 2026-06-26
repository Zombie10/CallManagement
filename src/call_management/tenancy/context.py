"""Resolve active tenant and per-tenant CRM."""

from __future__ import annotations

from dataclasses import dataclass

from call_management.crm.database import CRMDatabase
from call_management.crm.factory import get_crm_backend
from call_management.tenancy.paths import tenant_crm_path
from call_management.tenancy.platform_store import AgentInstance, Tenant, get_platform_store

_crm_cache: dict[str, CRMDatabase] = {}


@dataclass
class TenantContext:
    tenant: Tenant
    agent_instance: AgentInstance | None = None


async def resolve_crm_for_tenant(tenant_id: str) -> CRMDatabase:
    if tenant_id in _crm_cache:
        return _crm_cache[tenant_id]
    db = await get_crm_backend(str(tenant_crm_path(tenant_id)))
    _crm_cache[tenant_id] = db
    return db


def clear_crm_cache() -> None:
    _crm_cache.clear()


def get_tenant_context(
    *,
    tenant_id: str | None,
    agent_instance_id: str | None = None,
    user_tenant_id: str | None = None,
    is_super_admin: bool = False,
) -> TenantContext:
    store = get_platform_store()
    resolved_tenant_id = tenant_id or user_tenant_id
    if not resolved_tenant_id:
        resolved_tenant_id = store.ensure_default_tenant().id
    if not is_super_admin and user_tenant_id and tenant_id and tenant_id != user_tenant_id:
        raise PermissionError("No puedes acceder a otra empresa")
    if not is_super_admin and user_tenant_id:
        resolved_tenant_id = user_tenant_id

    tenant = store.get_tenant(resolved_tenant_id)
    if not tenant:
        raise ValueError("Empresa no encontrada")
    if tenant.status != "active" and not is_super_admin:
        raise ValueError("Empresa suspendida")

    agent_instance = None
    if agent_instance_id:
        agent_instance = store.get_agent(agent_instance_id)
        if not agent_instance or agent_instance.tenant_id != tenant.id:
            raise ValueError("Agente no encontrado en esta empresa")

    return TenantContext(tenant=tenant, agent_instance=agent_instance)


def resolve_dispatch(
    *,
    dialed_number: str | None = None,
    phone_number: str | None = None,
    tenant_id: str | None = None,
    agent_instance_id: str | None = None,
) -> tuple[Tenant, AgentInstance | None, str]:
    """Map inbound call metadata to tenant + initial template agent name.

    ``dialed_number`` is the trunk/DID the caller dialed (primary for SIP inbound).
    ``phone_number`` is kept for backwards compatibility and tests.
    """
    store = get_platform_store()
    agent: AgentInstance | None = None
    tenant: Tenant | None = None
    lookup_number = dialed_number or phone_number

    if agent_instance_id:
        agent = store.get_agent(agent_instance_id)
        if agent:
            tenant = store.get_tenant(agent.tenant_id)

    if not agent and lookup_number:
        route = store.resolve_phone(lookup_number)
        if route:
            agent = store.get_agent(route.agent_instance_id)
            tenant = store.get_tenant(route.tenant_id)

    if not tenant and tenant_id:
        tenant = store.get_tenant(tenant_id)

    if not tenant:
        tenant = store.ensure_default_tenant()

    initial_template = agent.template_id if agent else "receptionist"
    return tenant, agent, initial_template