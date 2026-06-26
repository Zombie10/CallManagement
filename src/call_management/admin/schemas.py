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


class ChatSessionCreate(BaseModel):
    phone_number: str = "+15551234567"
    customer_name: str | None = None
    department: str | None = None
    initial_agent: str = "receptionist"
    vip: bool = False


class ChatMessagePayload(BaseModel):
    message: str


class VoiceSessionCreate(BaseModel):
    agent: str = "receptionist"
    phone_number: str = "+15551234567"
    customer_name: str | None = None


class VoiceToolExecute(BaseModel):
    function_name: str
    arguments: dict = Field(default_factory=dict)
    phone_number: str = "+15551234567"
    customer_name: str | None = None


class LiveKitPlaygroundCreate(BaseModel):
    initial_agent: str = "receptionist"
    phone_number: str = "+15551234567"
    customer_name: str | None = None
    vip: bool = False


class AgentProfilePayload(BaseModel):
    name: str
    display_name: str | None = None
    provider: str = "xai"
    voice: str = "ara"
    locale: str = "en"
    voice_language: str = ""
    custom_instructions: str = ""
    tools: list[str] = Field(default_factory=list)
    function_tools: list[str] = Field(default_factory=list)
    mcp_servers: list[str] = Field(default_factory=list)
    enabled: bool = True