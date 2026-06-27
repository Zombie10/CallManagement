#!/usr/bin/env python3
"""End-to-end telephony diagnostic for inbound PSTN (LiveKit Phone Numbers).

Checks worker, platform.db routes, dispatch rules, and agent dispatch pipeline.
Run on the VPS: .venv/bin/python scripts/test_telephony_inbound.py --phone +15109379101
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sqlite3
import subprocess
import sys
import time
import uuid

from dotenv import load_dotenv
from livekit import api
from livekit.protocol import sip as sip_proto

AGENT_NAME = "call-management"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _section(title: str) -> None:
    print(f"\n=== {title} ===")


def _worker_registered() -> bool:
    proc = subprocess.run(
        ["journalctl", "-u", "callmanagement-worker", "-n", "200", "--no-pager"],
        capture_output=True,
        text=True,
        check=False,
    )
    for line in proc.stdout.splitlines():
        if "registered worker" in line and AGENT_NAME in line:
            print("OK: worker registered as", AGENT_NAME)
            return True
    print("FAIL: no recent 'registered worker' log for", AGENT_NAME)
    return False


def _platform_routes(phone: str) -> bool:
    db_path = os.path.join(ROOT, "data", "platform.db")
    if not os.path.exists(db_path):
        db_path = os.path.join(ROOT, "platform.db")
    if not os.path.exists(db_path):
        print(f"WARN: {db_path} not found")
        return False
    conn = sqlite3.connect(db_path)
    ok = False
    for row in conn.execute(
        "SELECT id, display_name, status, phone_number FROM agent_instances"
    ):
        print("agent_instance:", row)
    for row in conn.execute("SELECT * FROM phone_routes"):
        print("phone_route:", row)
        if phone in str(row):
            ok = True
    if ok:
        print("OK: phone route found for", phone)
    else:
        print("WARN: no phone_routes row contains", phone)
    return ok


def _lk_number_get(phone: str, env: dict[str, str]) -> str | None:
    proc = subprocess.run(
        ["lk", "number", "get", "--number", phone],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    print(proc.stdout)
    if proc.returncode != 0:
        print(proc.stderr)
        return None
    for line in proc.stdout.splitlines():
        if "SIP Dispatch Rules:" in line:
            value = line.split(":", 1)[1].strip()
            if value and value != "-":
                return value.split(",")[0].strip()
    return None


async def _audit_dispatch_rules(lk: api.LiveKitAPI, phone: str) -> list[str]:
    issues: list[str] = []
    listed = await lk.sip.list_dispatch_rule(sip_proto.ListSIPDispatchRuleRequest())
    catch_all = []
    scoped = []
    for item in listed.items:
        trunks = list(item.trunk_ids)
        agents: list[str] = []
        for agent in item.room_config.agents:
            name = getattr(agent, "agent_name", None)
            if name:
                agents.append(name)
            for dispatch in getattr(agent, "dispatches", []):
                dn = getattr(dispatch, "agent_name", None)
                if dn:
                    agents.append(dn)
        entry = (
            f"{item.sip_dispatch_rule_id} name={item.name!r} "
            f"trunks={trunks or ['<any>']} agents={agents or ['MISSING']}"
        )
        print(entry)
        if not trunks:
            catch_all.append(item.sip_dispatch_rule_id)
        else:
            scoped.append(item.sip_dispatch_rule_id)
        if AGENT_NAME not in agents:
            issues.append(f"Rule {item.sip_dispatch_rule_id} missing agent {AGENT_NAME}")

    if len(catch_all) > 1:
        issues.append(
            f"Multiple catch-all dispatch rules ({catch_all}) may compete — delete extras"
        )
    if catch_all and scoped:
        issues.append(
            f"Catch-all rules {catch_all} coexist with scoped rules — may cause wrong match"
        )
    return issues


async def _test_agent_dispatch(lk: api.LiveKitAPI, phone: str) -> bool:
    room_name = f"call-test-{uuid.uuid4().hex[:8]}"
    metadata = json.dumps(
        {
            "department": "receptionist",
            "phone_number": phone,
            "call_id": f"call_{uuid.uuid4().hex[:8]}",
        }
    )
    await lk.room.create_room(
        api.CreateRoomRequest(name=room_name, empty_timeout=120, departure_timeout=30)
    )
    dispatch = await lk.agent_dispatch.create_dispatch(
        api.CreateAgentDispatchRequest(
            agent_name=AGENT_NAME,
            room=room_name,
            metadata=metadata,
        )
    )
    print(f"Created room {room_name}, dispatch {dispatch.id}")
    joined = False
    for i in range(10):
        await asyncio.sleep(2)
        parts = await lk.room.list_participants(
            api.ListParticipantsRequest(room=room_name)
        )
        names = [(p.identity, p.kind) for p in parts.participants]
        print(f"  t+{(i + 1) * 2}s participants={len(names)} {names}")
        if any("agent" in (identity or "").lower() for identity, _ in names):
            joined = True
            break
    if joined:
        print("PASS: agent dispatch pipeline works")
    else:
        print("FAIL: agent did not join within 20s")
    return joined


async def run(phone: str, skip_dispatch_test: bool) -> int:
    load_dotenv(os.path.join(ROOT, ".env"))
    url = os.getenv("LIVEKIT_URL", "").strip()
    key = os.getenv("LIVEKIT_API_KEY", "").strip()
    secret = os.getenv("LIVEKIT_API_SECRET", "").strip()
    if not url or not key or not secret:
        print("FAIL: LIVEKIT_* env vars missing")
        return 1

    env = {**os.environ, "LIVEKIT_URL": url, "LIVEKIT_API_KEY": key, "LIVEKIT_API_SECRET": secret}
    failures = 0

    _section("ENV")
    print("LIVEKIT_URL:", url)

    _section("WORKER")
    if not _worker_registered():
        failures += 1

    _section("PLATFORM.DB")
    _platform_routes(phone)

    _section("PHONE NUMBER")
    rule_id = _lk_number_get(phone, env)
    if not rule_id:
        print("FAIL: dispatch rule not assigned to phone number")
        failures += 1
    else:
        print("OK: assigned rule", rule_id)

    async with api.LiveKitAPI(url, key, secret) as lk:
        _section("DISPATCH RULES")
        issues = await _audit_dispatch_rules(lk, phone)
        for issue in issues:
            print("ISSUE:", issue)
            failures += 1

        _section("ACTIVE ROOMS (PSTN evidence)")
        rooms = await lk.room.list_rooms(api.ListRoomsRequest())
        call_rooms = [r for r in rooms.rooms if r.name.startswith("call-")]
        print(f"Total rooms: {len(rooms.rooms)}, call-* rooms: {len(call_rooms)}")
        for room in call_rooms[:5]:
            print(f"  {room.name} participants={room.num_participants}")
        if not call_rooms:
            print(
                "NOTE: No call-* rooms — recent PSTN calls did not create rooms "
                "(SIP layer failure before agent dispatch)"
            )

        if not skip_dispatch_test:
            _section("AGENT DISPATCH TEST")
            if not await _test_agent_dispatch(lk, phone):
                failures += 1

    _section("SUMMARY")
    if failures:
        print(f"RESULT: {failures} check(s) failed")
        print(
            "If agent test PASS but PSTN fails: check LiveKit Telephony call logs, "
            "delete duplicate catch-all rules, ensure only assigned rule is active."
        )
        return 1
    print("RESULT: all checks passed — worker pipeline OK; PSTN should work if call logs show INVITE accepted")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Diagnose inbound telephony setup")
    parser.add_argument("--phone", default="+15109379101")
    parser.add_argument("--skip-dispatch-test", action="store_true")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run(args.phone, args.skip_dispatch_test)))


if __name__ == "__main__":
    main()