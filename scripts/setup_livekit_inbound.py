#!/usr/bin/env python3
"""Configure LiveKit inbound dispatch for Call Management (SIP / phone numbers).

Requires LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET in the environment.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

from dotenv import load_dotenv
from livekit import api
from livekit.protocol import room as room_proto
from livekit.protocol import sip as sip_proto

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


def _has_agent_dispatch(room_config: room_proto.RoomConfiguration) -> bool:
    for agent in room_config.agents:
        for dispatch in agent.dispatches:
            if dispatch.agent_name == AGENT_NAME:
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

        room_config = room_proto.RoomConfiguration(
            agents=[
                room_proto.RoomAgent(
                    dispatches=[
                        room_proto.RoomAgentDispatch(agent_name=AGENT_NAME),
                    ]
                )
            ]
        )
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
    parser.add_argument("--with-trunk", action="store_true", help="Also create inbound SIP trunk")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    phone = args.phone.strip()
    if not phone.startswith("+"):
        raise SystemExit("Phone must be E.164 format starting with +")

    _load_env()

    async def run() -> None:
        if args.with_trunk:
            await ensure_inbound_trunk(phone_number=phone, dry_run=args.dry_run)
        await ensure_dispatch_rule(phone_number=phone, dry_run=args.dry_run)

    asyncio.run(run())


if __name__ == "__main__":
    main()