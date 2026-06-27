"""Platform database: tenants, agent instances, phone routes, schedules."""

from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from call_management.agent_store import get_default_function_tools
from call_management.tenancy.paths import platform_db_path, tenant_dir

SLUG_RE = re.compile(r"^[a-z][a-z0-9_-]{0,47}$")
AGENT_STATUSES = frozenset({"draft", "active", "paused"})
TEMPLATE_IDS = frozenset(
    {"receptionist", "banking_support", "support", "sales", "technical", "escalation"}
)


def _utc_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


@dataclass
class Tenant:
    id: str
    slug: str
    name: str
    status: str = "active"
    logo_url: str | None = None
    brand_color: str | None = None
    max_agents: int = 10
    max_calls_per_day: int = 1000
    timezone: str = "America/Guatemala"
    created_at: str = ""
    updated_at: str = ""


@dataclass
class AgentInstance:
    id: str
    tenant_id: str
    slug: str
    display_name: str
    template_id: str
    status: str = "draft"
    phone_number: str | None = None
    sip_trunk_id: str | None = None
    provider: str = "xai"
    voice: str = "ara"
    locale: str = "es"
    voice_language: str = ""
    custom_instructions: str = ""
    tools: list[str] = field(default_factory=list)
    function_tools: list[str] = field(default_factory=list)
    mcp_servers: list[str] = field(default_factory=list)
    brand_name: str | None = None
    schedule_json: str | None = None
    phone_numbers: list[str] = field(default_factory=list)
    call_count_today: int = 0
    created_at: str = ""
    updated_at: str = ""


@dataclass
class PhoneRoute:
    id: str
    tenant_id: str
    agent_instance_id: str
    phone_number: str
    sip_trunk_id: str | None = None
    enabled: bool = True


@dataclass
class AgentSchedule:
    id: str
    agent_instance_id: str
    day_of_week: int
    start_time: str
    end_time: str
    timezone: str = "America/Guatemala"


class PlatformStore:
    def __init__(self, db_path: str | None = None) -> None:
        self.db_path = db_path or str(platform_db_path())

    def _connect(self) -> sqlite3.Connection:
        from pathlib import Path

        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def initialize(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS tenants (
                    id TEXT PRIMARY KEY,
                    slug TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    logo_url TEXT,
                    brand_color TEXT,
                    max_agents INTEGER NOT NULL DEFAULT 10,
                    max_calls_per_day INTEGER NOT NULL DEFAULT 1000,
                    timezone TEXT NOT NULL DEFAULT 'America/Guatemala',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS agent_instances (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    slug TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    template_id TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'draft',
                    phone_number TEXT,
                    sip_trunk_id TEXT,
                    provider TEXT NOT NULL DEFAULT 'xai',
                    voice TEXT NOT NULL DEFAULT 'ara',
                    locale TEXT NOT NULL DEFAULT 'es',
                    voice_language TEXT,
                    custom_instructions TEXT,
                    tools_json TEXT NOT NULL DEFAULT '[]',
                    function_tools_json TEXT NOT NULL DEFAULT '[]',
                    mcp_servers_json TEXT NOT NULL DEFAULT '[]',
                    brand_name TEXT,
                    schedule_json TEXT,
                    call_count_today INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                    UNIQUE(tenant_id, slug)
                );

                CREATE TABLE IF NOT EXISTS phone_routes (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    agent_instance_id TEXT NOT NULL,
                    phone_number TEXT NOT NULL,
                    sip_trunk_id TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                    FOREIGN KEY (agent_instance_id) REFERENCES agent_instances(id) ON DELETE CASCADE,
                    UNIQUE(phone_number)
                );

                CREATE TABLE IF NOT EXISTS agent_schedules (
                    id TEXT PRIMARY KEY,
                    agent_instance_id TEXT NOT NULL,
                    day_of_week INTEGER NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    timezone TEXT NOT NULL DEFAULT 'America/Guatemala',
                    FOREIGN KEY (agent_instance_id) REFERENCES agent_instances(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agent_instances(tenant_id);
                CREATE INDEX IF NOT EXISTS idx_phone_routes_number ON phone_routes(phone_number);

                CREATE TABLE IF NOT EXISTS tenant_webhooks (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    url TEXT NOT NULL,
                    events_json TEXT NOT NULL DEFAULT '["call.ended"]',
                    secret TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS webhook_deliveries (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    webhook_id TEXT,
                    event TEXT NOT NULL,
                    url TEXT NOT NULL,
                    status_code INTEGER,
                    success INTEGER NOT NULL DEFAULT 0,
                    attempts INTEGER NOT NULL DEFAULT 1,
                    error TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS tenant_api_keys (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    key_hash TEXT NOT NULL,
                    key_prefix TEXT NOT NULL,
                    scopes_json TEXT NOT NULL DEFAULT '[]',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    last_used_at TEXT,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant ON webhook_deliveries(tenant_id);
                CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON tenant_api_keys(tenant_id);
                """
            )
            cols = {r[1] for r in conn.execute("PRAGMA table_info(agent_instances)").fetchall()}
            if "phone_numbers_json" not in cols:
                conn.execute(
                    "ALTER TABLE agent_instances ADD COLUMN phone_numbers_json TEXT NOT NULL DEFAULT '[]'"
                )
            conn.commit()
        self.ensure_default_tenant()

    def ensure_default_tenant(self) -> Tenant:
        existing = self.get_tenant_by_slug("default")
        if existing:
            tenant_dir(existing.id)
            return existing
        return self.create_tenant(
            slug="default",
            name="Empresa principal",
            status="active",
        )

    def _row_tenant(self, row: sqlite3.Row) -> Tenant:
        return Tenant(
            id=row["id"],
            slug=row["slug"],
            name=row["name"],
            status=row["status"],
            logo_url=row["logo_url"],
            brand_color=row["brand_color"],
            max_agents=row["max_agents"],
            max_calls_per_day=row["max_calls_per_day"],
            timezone=row["timezone"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _row_agent(self, row: sqlite3.Row) -> AgentInstance:
        keys = row.keys()
        extra = json.loads(row["phone_numbers_json"]) if "phone_numbers_json" in keys else []
        primary = row["phone_number"]
        numbers = list(dict.fromkeys([n for n in ([primary] if primary else []) + extra if n and str(n).strip()]))
        return AgentInstance(
            id=row["id"],
            tenant_id=row["tenant_id"],
            slug=row["slug"],
            display_name=row["display_name"],
            template_id=row["template_id"],
            status=row["status"],
            phone_number=primary,
            phone_numbers=numbers,
            sip_trunk_id=row["sip_trunk_id"],
            provider=row["provider"],
            voice=row["voice"],
            locale=row["locale"],
            voice_language=row["voice_language"] or "",
            custom_instructions=row["custom_instructions"] or "",
            tools=json.loads(row["tools_json"] or "[]"),
            function_tools=json.loads(row["function_tools_json"] or "[]"),
            mcp_servers=json.loads(row["mcp_servers_json"] or "[]"),
            brand_name=row["brand_name"],
            schedule_json=row["schedule_json"],
            call_count_today=row["call_count_today"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def list_tenants(self) -> list[Tenant]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM tenants ORDER BY name").fetchall()
        return [self._row_tenant(r) for r in rows]

    def get_tenant(self, tenant_id: str) -> Tenant | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,)).fetchone()
        return self._row_tenant(row) if row else None

    def get_tenant_by_slug(self, slug: str) -> Tenant | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM tenants WHERE slug = ?", (slug,)).fetchone()
        return self._row_tenant(row) if row else None

    def create_tenant(
        self,
        *,
        slug: str,
        name: str,
        status: str = "active",
        logo_url: str | None = None,
        brand_color: str | None = None,
        max_agents: int = 10,
        max_calls_per_day: int = 1000,
        timezone: str = "America/Guatemala",
    ) -> Tenant:
        slug = slug.strip().lower()
        if not SLUG_RE.match(slug):
            raise ValueError("Slug inválido: use minúsculas, números, guiones")
        now = _utc_iso()
        tenant_id = _new_id("ten")
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO tenants (id, slug, name, status, logo_url, brand_color,
                    max_agents, max_calls_per_day, timezone, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tenant_id,
                    slug,
                    name.strip(),
                    status,
                    logo_url,
                    brand_color,
                    max_agents,
                    max_calls_per_day,
                    timezone,
                    now,
                    now,
                ),
            )
            conn.commit()
        tenant_dir(tenant_id)
        return self.get_tenant(tenant_id)  # type: ignore[return-value]

    def update_tenant(self, tenant_id: str, **fields: Any) -> Tenant:
        allowed = {
            "name",
            "status",
            "logo_url",
            "brand_color",
            "max_agents",
            "max_calls_per_day",
            "timezone",
        }
        updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
        if not updates:
            tenant = self.get_tenant(tenant_id)
            if not tenant:
                raise ValueError("Empresa no encontrada")
            return tenant
        updates["updated_at"] = _utc_iso()
        cols = ", ".join(f"{k} = ?" for k in updates)
        with self._connect() as conn:
            conn.execute(
                f"UPDATE tenants SET {cols} WHERE id = ?",
                (*updates.values(), tenant_id),
            )
            conn.commit()
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            raise ValueError("Empresa no encontrada")
        return tenant

    def delete_tenant(self, tenant_id: str) -> None:
        if tenant_id == self.ensure_default_tenant().id:
            raise ValueError("No se puede eliminar la empresa por defecto")
        with self._connect() as conn:
            conn.execute("DELETE FROM tenants WHERE id = ?", (tenant_id,))
            conn.commit()

    def list_agents(self, tenant_id: str) -> list[AgentInstance]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM agent_instances WHERE tenant_id = ? ORDER BY display_name",
                (tenant_id,),
            ).fetchall()
        return [self._row_agent(r) for r in rows]

    def get_agent(self, agent_id: str) -> AgentInstance | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM agent_instances WHERE id = ?", (agent_id,)).fetchone()
        return self._row_agent(row) if row else None

    def create_agent(
        self,
        tenant_id: str,
        *,
        slug: str,
        display_name: str,
        template_id: str,
        status: str = "draft",
        **kwargs: Any,
    ) -> AgentInstance:
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            raise ValueError("Empresa no encontrada")
        agents = self.list_agents(tenant_id)
        if len(agents) >= tenant.max_agents:
            raise ValueError(f"Límite de agentes alcanzado ({tenant.max_agents})")
        slug = slug.strip().lower()
        if not SLUG_RE.match(slug):
            raise ValueError("Slug de agente inválido")
        template_id = template_id.strip().lower()
        if template_id not in TEMPLATE_IDS:
            raise ValueError(f"Plantilla desconocida: {template_id}")
        if status not in AGENT_STATUSES:
            raise ValueError("Estado inválido: draft, active, paused")

        fn_tools = kwargs.get("function_tools") or list(get_default_function_tools(template_id))
        raw_nums = kwargs.get("phone_numbers") or []
        if kwargs.get("phone_number"):
            raw_nums = [kwargs["phone_number"], *raw_nums]
        phone_list = list(dict.fromkeys(str(n).strip() for n in raw_nums if str(n).strip()))
        primary_phone = phone_list[0] if phone_list else kwargs.get("phone_number")
        now = _utc_iso()
        agent_id = _new_id("agt")
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO agent_instances (
                    id, tenant_id, slug, display_name, template_id, status,
                    phone_number, phone_numbers_json, sip_trunk_id, provider, voice, locale, voice_language,
                    custom_instructions, tools_json, function_tools_json, mcp_servers_json,
                    brand_name, schedule_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    agent_id,
                    tenant_id,
                    slug,
                    display_name.strip(),
                    template_id,
                    status,
                    primary_phone,
                    json.dumps(phone_list),
                    kwargs.get("sip_trunk_id"),
                    kwargs.get("provider", "xai"),
                    kwargs.get("voice", "ara"),
                    kwargs.get("locale", "es"),
                    kwargs.get("voice_language", ""),
                    kwargs.get("custom_instructions", ""),
                    json.dumps(kwargs.get("tools") or []),
                    json.dumps(fn_tools),
                    json.dumps(kwargs.get("mcp_servers") or []),
                    kwargs.get("brand_name"),
                    kwargs.get("schedule_json"),
                    now,
                    now,
                ),
            )
            conn.commit()
        agent = self.get_agent(agent_id)
        if agent:
            self._sync_phone_routes(agent)
        return agent  # type: ignore[return-value]

    def update_agent(self, agent_id: str, **fields: Any) -> AgentInstance:
        agent = self.get_agent(agent_id)
        if not agent:
            raise ValueError("Agente no encontrado")
        allowed = {
            "display_name",
            "status",
            "phone_number",
            "phone_numbers",
            "sip_trunk_id",
            "provider",
            "voice",
            "locale",
            "voice_language",
            "custom_instructions",
            "tools",
            "function_tools",
            "mcp_servers",
            "brand_name",
            "schedule_json",
        }
        updates: dict[str, Any] = {}
        for k, v in fields.items():
            if k not in allowed:
                continue
            if k == "status" and v not in AGENT_STATUSES:
                raise ValueError("Estado inválido")
            if k == "phone_numbers":
                nums = [str(n).strip() for n in (v or []) if str(n).strip()]
                updates["phone_numbers_json"] = json.dumps(nums)
                updates["phone_number"] = nums[0] if nums else None
                continue
            updates[k] = v
        if not updates:
            return agent

        now = _utc_iso()
        json_cols = {"tools": "tools_json", "function_tools": "function_tools_json", "mcp_servers": "mcp_servers_json"}
        sets: list[str] = []
        values: list[Any] = []
        for k, v in updates.items():
            col = json_cols.get(k, k)
            sets.append(f"{col} = ?")
            values.append(json.dumps(v) if k in json_cols else v)
        sets.append("updated_at = ?")
        values.append(now)
        values.append(agent_id)

        with self._connect() as conn:
            conn.execute(f"UPDATE agent_instances SET {', '.join(sets)} WHERE id = ?", values)
            conn.commit()
        updated = self.get_agent(agent_id)
        if not updated:
            raise ValueError("Agente no encontrado")
        if any(k in updates for k in ("phone_number", "phone_numbers_json", "sip_trunk_id")):
            self._sync_phone_routes(updated)
        return updated

    def duplicate_agent(self, agent_id: str, *, slug: str, display_name: str) -> AgentInstance:
        source = self.get_agent(agent_id)
        if not source:
            raise ValueError("Agente no encontrado")
        return self.create_agent(
            source.tenant_id,
            slug=slug,
            display_name=display_name,
            template_id=source.template_id,
            status="draft",
            provider=source.provider,
            voice=source.voice,
            locale=source.locale,
            voice_language=source.voice_language,
            custom_instructions=source.custom_instructions,
            tools=list(source.tools),
            function_tools=list(source.function_tools),
            mcp_servers=list(source.mcp_servers),
            brand_name=source.brand_name,
            schedule_json=source.schedule_json,
        )

    def delete_agent(self, agent_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM phone_routes WHERE agent_instance_id = ?", (agent_id,))
            conn.execute("DELETE FROM agent_schedules WHERE agent_instance_id = ?", (agent_id,))
            conn.execute("DELETE FROM agent_instances WHERE id = ?", (agent_id,))
            conn.commit()

    def _agent_phone_list(self, agent: AgentInstance) -> list[str]:
        nums = list(agent.phone_numbers or [])
        if agent.phone_number and agent.phone_number.strip() not in nums:
            nums.insert(0, agent.phone_number.strip())
        return list(dict.fromkeys(n for n in nums if n))

    def _sync_phone_routes(self, agent: AgentInstance) -> None:
        numbers = self._agent_phone_list(agent)
        with self._connect() as conn:
            conn.execute("DELETE FROM phone_routes WHERE agent_instance_id = ?", (agent.id,))
            for num in numbers:
                conn.execute(
                    """
                    INSERT INTO phone_routes (id, tenant_id, agent_instance_id, phone_number, sip_trunk_id, enabled)
                    VALUES (?, ?, ?, ?, ?, 1)
                    """,
                    (_new_id("phn"), agent.tenant_id, agent.id, num, agent.sip_trunk_id),
                )
            conn.commit()

    def list_phone_routes(self, agent_instance_id: str) -> list[PhoneRoute]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM phone_routes WHERE agent_instance_id = ? ORDER BY phone_number",
                (agent_instance_id,),
            ).fetchall()
        return [
            PhoneRoute(
                id=r["id"],
                tenant_id=r["tenant_id"],
                agent_instance_id=r["agent_instance_id"],
                phone_number=r["phone_number"],
                sip_trunk_id=r["sip_trunk_id"],
                enabled=bool(r["enabled"]),
            )
            for r in rows
        ]

    def tenant_within_call_limit(self, tenant_id: str) -> bool:
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            return True
        metrics = self.tenant_metrics(tenant_id)
        return metrics["calls_today"] < tenant.max_calls_per_day

    def resolve_phone(self, phone_number: str) -> PhoneRoute | None:
        from call_management.crm.banking_data import normalize_phone

        normalized = normalize_phone(phone_number)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM phone_routes WHERE phone_number = ? AND enabled = 1",
                (normalized,),
            ).fetchone()
            if not row:
                row = conn.execute(
                    "SELECT * FROM phone_routes WHERE phone_number = ? AND enabled = 1",
                    (phone_number.strip(),),
                ).fetchone()
        if not row:
            return None
        return PhoneRoute(
            id=row["id"],
            tenant_id=row["tenant_id"],
            agent_instance_id=row["agent_instance_id"],
            phone_number=row["phone_number"],
            sip_trunk_id=row["sip_trunk_id"],
            enabled=bool(row["enabled"]),
        )

    def list_schedules(self, agent_instance_id: str) -> list[AgentSchedule]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM agent_schedules WHERE agent_instance_id = ? ORDER BY day_of_week, start_time",
                (agent_instance_id,),
            ).fetchall()
        return [
            AgentSchedule(
                id=r["id"],
                agent_instance_id=r["agent_instance_id"],
                day_of_week=r["day_of_week"],
                start_time=r["start_time"],
                end_time=r["end_time"],
                timezone=r["timezone"],
            )
            for r in rows
        ]

    def set_schedules(self, agent_instance_id: str, schedules: list[dict[str, Any]]) -> list[AgentSchedule]:
        with self._connect() as conn:
            conn.execute("DELETE FROM agent_schedules WHERE agent_instance_id = ?", (agent_instance_id,))
            for entry in schedules:
                conn.execute(
                    """
                    INSERT INTO agent_schedules (id, agent_instance_id, day_of_week, start_time, end_time, timezone)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        _new_id("sch"),
                        agent_instance_id,
                        int(entry["day_of_week"]),
                        entry["start_time"],
                        entry["end_time"],
                        entry.get("timezone", "America/Guatemala"),
                    ),
                )
            conn.commit()
        return self.list_schedules(agent_instance_id)

    def tenant_metrics(self, tenant_id: str) -> dict[str, Any]:
        agents = self.list_agents(tenant_id)
        tenant = self.get_tenant(tenant_id)
        return {
            "tenant_id": tenant_id,
            "agent_count": len(agents),
            "active_agents": sum(1 for a in agents if a.status == "active"),
            "paused_agents": sum(1 for a in agents if a.status == "paused"),
            "draft_agents": sum(1 for a in agents if a.status == "draft"),
            "calls_today": sum(a.call_count_today for a in agents),
            "max_agents": tenant.max_agents if tenant else 0,
            "max_calls_per_day": tenant.max_calls_per_day if tenant else 0,
        }

    def platform_metrics(self) -> dict[str, Any]:
        tenants = self.list_tenants()
        return {
            "tenant_count": len(tenants),
            "active_tenants": sum(1 for t in tenants if t.status == "active"),
            "total_agents": sum(len(self.list_agents(t.id)) for t in tenants),
            "tenants": [self.tenant_metrics(t.id) for t in tenants],
        }

    def increment_agent_calls(self, agent_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE agent_instances SET call_count_today = call_count_today + 1 WHERE id = ?",
                (agent_id,),
            )
            conn.commit()

    def list_webhooks(self, tenant_id: str, *, event: str | None = None) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM tenant_webhooks WHERE tenant_id = ? ORDER BY created_at DESC",
                (tenant_id,),
            ).fetchall()
        out = []
        for r in rows:
            events = json.loads(r["events_json"] or "[]")
            if event and event not in events:
                continue
            out.append(
                {
                    "id": r["id"],
                    "tenant_id": r["tenant_id"],
                    "url": r["url"],
                    "events": events,
                    "secret": r["secret"],
                    "enabled": bool(r["enabled"]),
                    "created_at": r["created_at"],
                }
            )
        return out

    def create_webhook(self, tenant_id: str, *, url: str, events: list[str], secret: str | None = None) -> dict[str, Any]:
        wid = _new_id("whk")
        now = _utc_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO tenant_webhooks (id, tenant_id, url, events_json, secret, enabled, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                """,
                (wid, tenant_id, url.strip(), json.dumps(events or ["call.ended"]), secret, now),
            )
            conn.commit()
        for hook in self.list_webhooks(tenant_id):
            if hook["id"] == wid:
                return hook
        return {"id": wid, "tenant_id": tenant_id, "url": url.strip(), "events": events or ["call.ended"], "secret": secret, "enabled": True, "created_at": now}

    def delete_webhook(self, webhook_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM tenant_webhooks WHERE id = ?", (webhook_id,))
            conn.commit()

    def log_webhook_delivery(
        self,
        *,
        tenant_id: str,
        webhook_id: str | None,
        event: str,
        url: str,
        status_code: int | None,
        success: bool,
        attempts: int,
        error: str | None,
    ) -> dict[str, Any]:
        did = _new_id("whd")
        now = _utc_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO webhook_deliveries
                (id, tenant_id, webhook_id, event, url, status_code, success, attempts, error, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    did,
                    tenant_id,
                    webhook_id,
                    event,
                    url,
                    status_code,
                    int(success),
                    attempts,
                    error,
                    now,
                ),
            )
            conn.commit()
        return {
            "id": did,
            "tenant_id": tenant_id,
            "webhook_id": webhook_id,
            "event": event,
            "url": url,
            "status_code": status_code,
            "success": success,
            "attempts": attempts,
            "error": error,
            "created_at": now,
        }

    def list_webhook_deliveries(
        self, tenant_id: str, *, limit: int = 50, offset: int = 0
    ) -> dict[str, Any]:
        with self._connect() as conn:
            total = conn.execute(
                "SELECT COUNT(*) AS c FROM webhook_deliveries WHERE tenant_id = ?",
                (tenant_id,),
            ).fetchone()["c"]
            rows = conn.execute(
                """
                SELECT * FROM webhook_deliveries WHERE tenant_id = ?
                ORDER BY created_at DESC LIMIT ? OFFSET ?
                """,
                (tenant_id, limit, offset),
            ).fetchall()
        items = [
            {
                "id": r["id"],
                "webhook_id": r["webhook_id"],
                "event": r["event"],
                "url": r["url"],
                "status_code": r["status_code"],
                "success": bool(r["success"]),
                "attempts": r["attempts"],
                "error": r["error"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    def create_api_key(
        self,
        tenant_id: str,
        *,
        name: str,
        scopes: list[str],
        raw_key: str,
        key_hash: str,
    ) -> dict[str, Any]:
        kid = _new_id("key")
        prefix = raw_key[:12]
        now = _utc_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO tenant_api_keys
                (id, tenant_id, name, key_hash, key_prefix, scopes_json, enabled, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (kid, tenant_id, name.strip(), key_hash, prefix, json.dumps(scopes), now),
            )
            conn.commit()
        return {
            "id": kid,
            "tenant_id": tenant_id,
            "name": name.strip(),
            "key_prefix": prefix,
            "scopes": scopes,
            "enabled": True,
            "created_at": now,
            "api_key": raw_key,
        }

    def list_api_keys(self, tenant_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM tenant_api_keys WHERE tenant_id = ? ORDER BY created_at DESC",
                (tenant_id,),
            ).fetchall()
        return [
            {
                "id": r["id"],
                "tenant_id": r["tenant_id"],
                "name": r["name"],
                "key_prefix": r["key_prefix"],
                "scopes": json.loads(r["scopes_json"] or "[]"),
                "enabled": bool(r["enabled"]),
                "created_at": r["created_at"],
                "last_used_at": r["last_used_at"],
            }
            for r in rows
        ]

    def get_api_key_by_hash(self, key_hash: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM tenant_api_keys WHERE key_hash = ? AND enabled = 1",
                (key_hash,),
            ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "tenant_id": row["tenant_id"],
            "name": row["name"],
            "key_prefix": row["key_prefix"],
            "scopes": json.loads(row["scopes_json"] or "[]"),
            "enabled": bool(row["enabled"]),
            "key_hash": row["key_hash"],
        }

    def touch_api_key(self, key_id: str) -> None:
        now = _utc_iso()
        with self._connect() as conn:
            conn.execute(
                "UPDATE tenant_api_keys SET last_used_at = ? WHERE id = ?",
                (now, key_id),
            )
            conn.commit()

    def revoke_api_key(self, key_id: str, tenant_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE tenant_api_keys SET enabled = 0 WHERE id = ? AND tenant_id = ?",
                (key_id, tenant_id),
            )
            conn.commit()
            return cur.rowcount > 0


_store: PlatformStore | None = None


def get_platform_store() -> PlatformStore:
    global _store
    if _store is None:
        _store = PlatformStore()
        _store.initialize()
    return _store


def reset_platform_store() -> None:
    global _store
    _store = None