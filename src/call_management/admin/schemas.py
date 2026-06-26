"""Pydantic schemas for the admin API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SettingsUpdate(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)


class CustomerUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    notes: str | None = None
    vip: bool = False


class CustomerCreate(BaseModel):
    phone_number: str
    name: str | None = None
    email: str | None = None
    notes: str | None = None
    vip: bool = False


class AgentProfilePayload(BaseModel):
    name: str
    display_name: str | None = None
    provider: str = "xai"
    voice: str = "Ara"
    locale: str = "en"
    tools: list[str] = Field(default_factory=list)
    mcp_servers: list[str] = Field(default_factory=list)
    enabled: bool = True