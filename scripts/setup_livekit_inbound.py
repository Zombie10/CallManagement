#!/usr/bin/env python3
"""Configure LiveKit inbound dispatch for Call Management (SIP / phone numbers).

Creates a dispatch rule that routes inbound calls to agent ``call-management``
with room prefix ``call-``.

Requires LIVEKIT_URL (WebSocket URL from cloud.livekit.io → Keys, NOT the SIP URI),
LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in .env.

Example (production project call management, DID US):

    uv run python scripts/setup_livekit_inbound.py --phone +15109379101

See docs/TELEPHONY.md for full telephony setup.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys

from dotenv import load_dotenv
from livekit import api
from livekit.protocol import room as room_proto
from livekit.protocol import sip as sip_proto

try:
    from livekit.protocol.agent_dispatch import RoomAgentDispatch
except ImportError:
    RoomAgentDispatch = None  # type: ignore[misc, assignment]

AGENT_NAME = "call-management"
DEFAULT_ROOM_PREFIX = "call-"


def _load_env() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(root, ".env"))


def _require_livekit() -> tuple[str, str, str]:
    url = os.getenv("LIVEKIT_URL", "").strip()
    key = os.getenv("LIVEKIT_API_KEY", "").strip()
    secret = os.getenv("LIVEKIT_API_SECRET", "").strip()
    if not url or "your-project" in url:
        raise SystemExit("LIVEKIT_URL is missing or still a placeholder")
    if not key or key in {"APIdummy", "API..."}:
        raise SystemExit("LIVEKIT_API_KEY is missing or still a placeholder")
    if not secret or secret in {"dummydummy", "secret..."}:
        raise SystemExit("LIVEKIT_API_SECRET is missing or still a placeholder")
    return url, key, secret


def _rule_matches(existing: sip_proto.SIPDispatchRuleInfo, *, number: str, prefix: str) -> bool:
    if existing.name and "call management" in existing.name.lower():
        return True
    if number in list(existing.inbound_numbers) or number in list(existing.numbers):
        return True
    rule = existing.rule
    if rule and rule.dispatch_rule_individual.room_prefix == prefix:
        return True
    return False


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
        name = getattr(agent, "agent_name", None)
        if name == AGENT_NAME:
            return True
        for dispatch in getattr(agent, "dispatches", []):
            if getattr(dispatch, "agent_name", None) == AGENT_NAME:
                return True
    return False


async def ensure_dispatch_rule(
    *,
    phone_number: str,
    room_prefix: str = DEFAULT_ROOM_PREFIX,
    dry_run: bool = False,
) -> str:
    url, key, secret = _require_livekit()
    async with api.LiveKitAPI(url, key, secret) as lk:
        listed = await lk.sip.list_dispatch_rule(sip_proto.ListSIPDispatchRuleRequest())
        for item in listed.items:
            if _rule_matches(item, number=phone_number, prefix=room_prefix):
                agents_ok = _has_agent_dispatch(item.room_config)
                print(f"Dispatch rule already exists: {item.sip_dispatch_rule_id} ({item.name})")
                if agents_ok:
                    print(f"  agent dispatch -> {AGENT_NAME}")
                    return item.sip_dispatch_rule_id
                print("  WARNING: rule exists but agent dispatch may be missing; update in LiveKit Cloud")

        room_config = _build_room_config()
        rule = sip_proto.SIPDispatchRule(
            dispatch_rule_individual=sip_proto.SIPDispatchRuleIndividual(
                room_prefix=room_prefix,
            )
        )
        request = sip_proto.CreateSIPDispatchRuleRequest(
            name="Call Management inbound",
            rule=rule,
            inbound_numbers=[phone_number],
            room_config=room_config,
        )
        if dry_run:
            print("DRY RUN — would create dispatch rule:")
            print(f"  number: {phone_number}")
            print(f"  room_prefix: {room_prefix}")
            print(f"  agent: {AGENT_NAME}")
            return "dry-run"

        created = await lk.sip.create_dispatch_rule(request)
        print(f"Created dispatch rule: {created.sip_dispatch_rule_id}")
        return created.sip_dispatch_rule_id


async def ensure_trunk_scoped_dispatch_rule(
    *,
    phone_number: str,
    trunk_id: str,
    room_prefix: str = DEFAULT_ROOM_PREFIX,
    dry_run: bool = False,
) -> str:
    """Dispatch rule bound to a trunk (required for LiveKit Phone Numbers assignment)."""
    url, key, secret = _require_livekit()
    async with api.LiveKitAPI(url, key, secret) as lk:
        listed = await lk.sip.list_dispatch_rule(sip_proto.ListSIPDispatchRuleRequest())
        for item in listed.items:
            if trunk_id in list(item.trunk_ids) and _has_agent_dispatch(item.room_config):
                print(
                    f"Trunk-scoped dispatch rule already exists: "
                    f"{item.sip_dispatch_rule_id} ({item.name})"
                )
                return item.sip_dispatch_rule_id

        room_config = _build_room_config()
        rule = sip_proto.SIPDispatchRule(
            dispatch_rule_individual=sip_proto.SIPDispatchRuleIndividual(
                room_prefix=room_prefix,
            )
        )
        request = sip_proto.CreateSIPDispatchRuleRequest(
            name=f"Call Management {phone_number}",
            trunk_ids=[trunk_id],
            rule=rule,
            room_config=room_config,
        )
        if dry_run:
            print("DRY RUN — would create trunk-scoped dispatch rule:")
            print(f"  trunk: {trunk_id}")
            print(f"  number: {phone_number}")
            return "dry-run"

        created = await lk.sip.create_dispatch_rule(request)
        print(f"Created trunk-scoped dispatch rule: {created.sip_dispatch_rule_id}")
        return created.sip_dispatch_rule_id


def _lk_env() -> dict[str, str]:
    url, key, secret = _require_livekit()
    return {
        **os.environ,
        "LIVEKIT_URL": url,
        "LIVEKIT_API_KEY": key,
        "LIVEKIT_API_SECRET": secret,
    }


def _run_lk(args: list[str], *, dry_run: bool = False) -> subprocess.CompletedProcess[str]:
    lk = shutil.which("lk")
    if not lk:
        raise SystemExit("LiveKit CLI (lk) not found — install from https://docs.livekit.io/reference/developer-tools/livekit-cli/")
    cmd = [lk, *args]
    if dry_run:
        print("DRY RUN — would run:", " ".join(cmd))
        return subprocess.CompletedProcess(cmd, 0, "", "")
    return subprocess.run(cmd, env=_lk_env(), text=True, capture_output=True, check=False)


def _livekit_phone_number_id(phone_number: str) -> str | None:
    """Return PN_PPN_* id for a LiveKit Phone Number (used as SIP trunk id)."""
    proc = _run_lk(["number", "list", "--json"])
    if proc.returncode != 0:
        print(proc.stderr or proc.stdout)
        raise SystemExit("Failed to list LiveKit phone numbers (is this a LiveKit Phone Number?)")
    payload = json.loads(proc.stdout)
    for item in payload.get("items", []):
        if item.get("e164Format") == phone_number:
            return str(item.get("id") or item.get("phoneNumberId") or "")
    return None


def _phone_number_dispatch_rule(phone_number: str) -> str | None:
    proc = _run_lk(["number", "list", "--json"])
    if proc.returncode != 0:
        print(proc.stderr or proc.stdout)
        raise SystemExit("Failed to list LiveKit phone numbers (is this a LiveKit Phone Number?)")
    payload = json.loads(proc.stdout)
    for item in payload.get("items", []):
        if item.get("e164Format") == phone_number:
            rules = item.get("sipDispatchRuleIds") or item.get("sip_dispatch_rule_ids") or []
            if isinstance(rules, list) and rules:
                return str(rules[0])
            # lk table output path: check via get
            get_proc = _run_lk(["number", "get", "--number", phone_number])
            if "SIP Dispatch Rules:" in get_proc.stdout:
                for line in get_proc.stdout.splitlines():
                    if line.strip().startswith("SIP Dispatch Rules:"):
                        value = line.split(":", 1)[1].strip()
                        if value and value != "-":
                            return value.split(",")[0].strip()
    return None


def assign_dispatch_to_phone_number(
    *,
    phone_number: str,
    dispatch_rule_id: str,
    dry_run: bool = False,
) -> None:
    """Link dispatch rule to a LiveKit Phone Number (required for inbound PSTN)."""
    existing = _phone_number_dispatch_rule(phone_number)
    if existing == dispatch_rule_id:
        print(f"Phone number {phone_number} already assigned to {dispatch_rule_id}")
        return

    proc = _run_lk(
        [
            "number",
            "update",
            "--number",
            phone_number,
            "--sip-dispatch-rule-id",
            dispatch_rule_id,
        ],
        dry_run=dry_run,
    )
    if proc.returncode != 0:
        print(proc.stderr or proc.stdout)
        raise SystemExit(
            "Failed to assign dispatch rule to phone number. "
            "Catch-all rules cannot be assigned — use ensure_trunk_scoped_dispatch_rule."
        )
    print(f"Assigned dispatch rule {dispatch_rule_id} to phone number {phone_number}")


async def ensure_inbound_trunk(*, phone_number: str, dry_run: bool = False) -> str | None:
    """Optional inbound trunk for third-party SIP providers (skip for LiveKit Phone Numbers)."""
    url, key, secret = _require_livekit()
    async with api.LiveKitAPI(url, key, secret) as lk:
        listed = await lk.sip.list_inbound_trunk(sip_proto.ListSIPInboundTrunkRequest())
        for trunk in listed.items:
            if phone_number in list(trunk.numbers):
                print(f"Inbound trunk already exists: {trunk.sip_trunk_id}")
                return trunk.sip_trunk_id

        request = sip_proto.CreateSIPInboundTrunkRequest(
            name="Call Management inbound trunk",
            numbers=[phone_number],
        )
        if dry_run:
            print("DRY RUN — would create inbound trunk for", phone_number)
            return "dry-run"

        created = await lk.sip.create_inbound_trunk(request)
        print(f"Created inbound trunk: {created.sip_trunk_id}")
        return created.sip_trunk_id


def main() -> None:
    parser = argparse.ArgumentParser(description="Setup LiveKit inbound telephony for Call Management")
    parser.add_argument("--phone", required=True, help="E.164 number, e.g. +15109379101")
    parser.add_argument(
        "--with-trunk",
        action="store_true",
        help="Also create inbound SIP trunk (external SIP providers)",
    )
    parser.add_argument(
        "--livekit-phone-number",
        action="store_true",
        help="Full setup for LiveKit Phone Numbers: trunk + scoped rule + assign to DID",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    phone = args.phone.strip()
    if not phone.startswith("+"):
        raise SystemExit("Phone must be E.164 format starting with +")

    _load_env()

    async def run() -> None:
        if args.livekit_phone_number:
            trunk_id = _livekit_phone_number_id(phone)
            if not trunk_id:
                raise SystemExit(
                    f"{phone} is not a LiveKit Phone Number in this project "
                    "(lk number list returned no match)"
                )
            print(f"Using LiveKit Phone Number trunk: {trunk_id}")
            rule_id = await ensure_trunk_scoped_dispatch_rule(
                phone_number=phone,
                trunk_id=trunk_id,
                dry_run=args.dry_run,
            )
            assign_dispatch_to_phone_number(
                phone_number=phone,
                dispatch_rule_id=rule_id,
                dry_run=args.dry_run,
            )
            return

        if args.with_trunk:
            await ensure_inbound_trunk(phone_number=phone, dry_run=args.dry_run)
        rule_id = await ensure_dispatch_rule(phone_number=phone, dry_run=args.dry_run)
        assigned = _phone_number_dispatch_rule(phone) if not args.dry_run else None
        if assigned is None and shutil.which("lk"):
            print(
                "NOTE: LiveKit Phone Numbers also need the rule assigned to the DID. "
                "Re-run with --livekit-phone-number or assign in cloud.livekit.io."
            )
        elif assigned and assigned != rule_id:
            print(
                f"WARNING: phone {phone} is assigned to {assigned}, "
                f"but API rule is {rule_id}. Use --livekit-phone-number to fix."
            )

    asyncio.run(run())


if __name__ == "__main__":
    main()