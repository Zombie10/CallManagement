"""LiveKit inbound telephony helpers for admin and agent provisioning."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from typing import Any

from call_management.dev_check import check_livekit_env

from livekit import api
from livekit.protocol import room as room_proto
from livekit.protocol import sip as sip_proto

try:
    from livekit.protocol.agent_dispatch import RoomAgentDispatch
except ImportError:
    RoomAgentDispatch = None  # type: ignore[misc, assignment]

AGENT_NAME = "call-management"
DEFAULT_ROOM_PREFIX = "call-"
DEMO_PHONE_RE = re.compile(r"^\+15550\d{5}$")

E164_RE = re.compile(r"^\+\d{8,15}$")


def livekit_configured() -> bool:
    return len(check_livekit_env()) == 0


def is_demo_phone(phone: str) -> bool:
    return bool(DEMO_PHONE_RE.match(phone.strip()))


def normalize_e164(phone: str) -> str | None:
    raw = phone.strip()
    if not raw:
        return None
    if E164_RE.match(raw):
        return raw
    return None


def _lk_env() -> dict[str, str] | None:
    if not livekit_configured():
        return None
    return {
        **os.environ,
        "LIVEKIT_URL": os.environ["LIVEKIT_URL"].strip(),
        "LIVEKIT_API_KEY": os.environ["LIVEKIT_API_KEY"].strip(),
        "LIVEKIT_API_SECRET": os.environ["LIVEKIT_API_SECRET"].strip(),
    }


def _run_lk(args: list[str]) -> subprocess.CompletedProcess[str]:
    lk = shutil.which("lk")
    if not lk:
        return subprocess.CompletedProcess(args, 1, "", "lk CLI not found")
    env = _lk_env()
    if not env:
        return subprocess.CompletedProcess(args, 1, "", "LiveKit not configured")
    return subprocess.run([lk, *args], env=env, text=True, capture_output=True, check=False)


_LK_NUMBERS_CACHE: tuple[float, dict[str, dict[str, Any]]] | None = None
_LK_NUMBERS_CACHE_TTL_SEC = 90.0


def invalidate_livekit_phone_cache() -> None:
    global _LK_NUMBERS_CACHE
    _LK_NUMBERS_CACHE = None


def list_livekit_phone_numbers(*, force_refresh: bool = False) -> dict[str, dict[str, Any]]:
    """Map E.164 → {id, dispatch_rule_id}. Cached to avoid N CLI calls per agent list."""
    global _LK_NUMBERS_CACHE
    now = time.monotonic()
    if (
        not force_refresh
        and _LK_NUMBERS_CACHE is not None
        and (now - _LK_NUMBERS_CACHE[0]) < _LK_NUMBERS_CACHE_TTL_SEC
    ):
        return _LK_NUMBERS_CACHE[1]

    proc = _run_lk(["number", "list", "--json"])
    if proc.returncode != 0:
        return _LK_NUMBERS_CACHE[1] if _LK_NUMBERS_CACHE else {}
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return _LK_NUMBERS_CACHE[1] if _LK_NUMBERS_CACHE else {}
    out: dict[str, dict[str, Any]] = {}
    for item in payload.get("items", []):
        e164 = item.get("e164Format")
        if not e164:
            continue
        rules = item.get("sipDispatchRuleIds") or item.get("sip_dispatch_rule_ids") or []
        rule_id = str(rules[0]) if rules else None
        out[e164] = {
            "id": str(item.get("id") or ""),
            "dispatch_rule_id": rule_id,
            "status": item.get("status"),
        }
    _LK_NUMBERS_CACHE = (now, out)
    return out


def get_dispatch_rule_for_phone(phone: str) -> str | None:
    info = list_livekit_phone_numbers().get(phone)
    if info and info.get("dispatch_rule_id"):
        return str(info["dispatch_rule_id"])
    proc = _run_lk(["number", "get", "--number", phone])
    if proc.returncode != 0:
        return None
    for line in proc.stdout.splitlines():
        if line.strip().startswith("SIP Dispatch Rules:"):
            value = line.split(":", 1)[1].strip()
            if value and value != "-":
                return value.split(",")[0].strip()
    return None


def _build_room_config() -> room_proto.RoomConfiguration:
    if RoomAgentDispatch is not None:
        return room_proto.RoomConfiguration(
            agents=[RoomAgentDispatch(agent_name=AGENT_NAME)]
        )
    agent = room_proto.RoomAgent()
    agent.dispatches.add(agent_name=AGENT_NAME)
    return room_proto.RoomConfiguration(agents=[agent])


def _has_agent_dispatch(room_config: room_proto.RoomConfiguration) -> bool:
    for agent in room_config.agents:
        if getattr(agent, "agent_name", None) == AGENT_NAME:
            return True
        for dispatch in getattr(agent, "dispatches", []):
            if getattr(dispatch, "agent_name", None) == AGENT_NAME:
                return True
    return False


async def ensure_livekit_phone_number_inbound(phone: str) -> dict[str, Any]:
    """Create/assign dispatch rule for a LiveKit Phone Number DID."""
    phone = normalize_e164(phone) or phone
    if not livekit_configured():
        return {
            "phone": phone,
            "configured": False,
            "auto_setup": False,
            "message": "LiveKit no configurado en el servidor (LIVEKIT_*)",
        }

    lk_numbers = list_livekit_phone_numbers()
    pn = lk_numbers.get(phone)
    if not pn or not pn.get("id"):
        return {
            "phone": phone,
            "configured": False,
            "auto_setup": False,
            "is_livekit_phone_number": False,
            "message": (
                f"{phone} no es un LiveKit Phone Number en este proyecto. "
                "Configura trunk SIP externo y dispatch manual (docs/TELEPHONY.md)."
            ),
        }

    trunk_id = str(pn["id"])
    url = os.environ["LIVEKIT_URL"].strip()
    key = os.environ["LIVEKIT_API_KEY"].strip()
    secret = os.environ["LIVEKIT_API_SECRET"].strip()

    async with api.LiveKitAPI(url, key, secret) as lk:
        listed = await lk.sip.list_dispatch_rule(sip_proto.ListSIPDispatchRuleRequest())
        rule_id: str | None = None
        for item in listed.items:
            if trunk_id in list(item.trunk_ids) and _has_agent_dispatch(item.room_config):
                rule_id = item.sip_dispatch_rule_id
                break

        if not rule_id:
            room_config = _build_room_config()
            rule = sip_proto.SIPDispatchRule(
                dispatch_rule_individual=sip_proto.SIPDispatchRuleIndividual(
                    room_prefix=DEFAULT_ROOM_PREFIX,
                )
            )
            created = await lk.sip.create_dispatch_rule(
                sip_proto.CreateSIPDispatchRuleRequest(
                    name=f"Call Management LK Phone {phone}",
                    trunk_ids=[trunk_id],
                    rule=rule,
                    room_config=room_config,
                )
            )
            rule_id = created.sip_dispatch_rule_id

    existing = get_dispatch_rule_for_phone(phone)
    if existing != rule_id:
        proc = _run_lk(
            ["number", "update", "--number", phone, "--sip-dispatch-rule-id", rule_id]
        )
        if proc.returncode != 0:
            return {
                "phone": phone,
                "configured": False,
                "auto_setup": False,
                "is_livekit_phone_number": True,
                "dispatch_rule_id": rule_id,
                "message": (proc.stderr or proc.stdout or "Error asignando dispatch al número"),
            }

    invalidate_livekit_phone_cache()
    return {
        "phone": phone,
        "configured": True,
        "auto_setup": True,
        "is_livekit_phone_number": True,
        "dispatch_rule_id": rule_id,
        "message": f"Dispatch rule {rule_id} asignada a {phone}",
    }


def build_agent_telephony_summary(
    *,
    status: str,
    phone_numbers: list[str],
    worker_livekit_ready: bool,
    worker_xai_ready: bool,
    lk_numbers: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    phones = [p for p in phone_numbers if p]
    real_phones = [p for p in phones if not is_demo_phone(p)]
    demo_phones = [p for p in phones if is_demo_phone(p)]

    if lk_numbers is None and livekit_configured():
        lk_numbers = list_livekit_phone_numbers()
    lk_numbers = lk_numbers or {}
    phone_details = []
    for num in phones:
        lk = lk_numbers.get(num, {})
        dispatch_id = lk.get("dispatch_rule_id")
        phone_details.append(
            {
                "phone_number": num,
                "is_demo": is_demo_phone(num),
                "is_livekit_phone_number": num in lk_numbers,
                "dispatch_assigned": bool(dispatch_id),
                "dispatch_rule_id": dispatch_id,
            }
        )

    if status != "active":
        primary_mode = "playground_only"
        mode_label = "Solo pruebas (inactivo)"
    elif real_phones:
        primary_mode = "livekit_pstn"
        mode_label = "Llamadas reales (LiveKit PSTN)"
    elif demo_phones:
        primary_mode = "demo_did"
        mode_label = "DID demo (sin PSTN real)"
    else:
        primary_mode = "playground_only"
        mode_label = "Solo pruebas (sin teléfono)"

    channels = [
        {
            "id": "console_local",
            "label": "Consola local",
            "available": worker_xai_ready,
            "description": "Terminal: call-management console -a <plantilla>",
        },
        {
            "id": "playground_xai",
            "label": "Admin · xAI directo",
            "available": worker_xai_ready,
            "description": "Probar agente → Voz → xAI directo",
        },
        {
            "id": "playground_livekit",
            "label": "Admin · LiveKit producción",
            "available": worker_livekit_ready,
            "description": "Misma pipeline que PSTN, sin marcar por teléfono",
        },
        {
            "id": "pstn_livekit",
            "label": "Teléfono PSTN",
            "available": status == "active" and bool(real_phones) and worker_livekit_ready,
            "description": "Marca el DID E.164; requiere dispatch rule en LiveKit",
        },
    ]

    return {
        "mode": primary_mode,
        "mode_label": mode_label,
        "channels": channels,
        "phones": phone_details,
        "livekit_configured": livekit_configured(),
        "worker_livekit_ready": worker_livekit_ready,
        "worker_xai_ready": worker_xai_ready,
    }


async def provision_phones_for_agent(phone_numbers: list[str]) -> list[dict[str, Any]]:
    """Auto-provision LiveKit dispatch for any project phone numbers."""
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in phone_numbers:
        phone = normalize_e164(raw)
        if not phone or phone in seen:
            continue
        seen.add(phone)
        if is_demo_phone(phone):
            results.append(
                {
                    "phone": phone,
                    "configured": True,
                    "auto_setup": False,
                    "message": "Número demo — no requiere dispatch en LiveKit",
                }
            )
            continue
        results.append(await ensure_livekit_phone_number_inbound(phone))
    if results:
        invalidate_livekit_phone_cache()
    return results