"""Example: Trigger an outbound call programmatically (not via the agent).

This is useful for campaigns, reminders, or follow-ups.
You would typically call this from your backend or a scheduled job.
"""

import asyncio
import os
from dotenv import load_dotenv
from livekit import api

load_dotenv()

async def make_outbound_call(phone_number: str, room_name: str = None):
    """Create a SIP participant (outbound call) using the LiveKit Server API."""
    lk_api = api.LiveKitAPI(
        url=os.getenv("LIVEKIT_URL"),
        api_key=os.getenv("LIVEKIT_API_KEY"),
        api_secret=os.getenv("LIVEKIT_API_SECRET"),
    )

    trunk_id = os.getenv("SIP_TRUNK_ID")
    if not trunk_id:
        raise RuntimeError("SIP_TRUNK_ID is required for outbound calls")

    room = room_name or f"outbound-{phone_number.replace('+', '')}"

    req = api.CreateSIPParticipantRequest(
        sip_trunk_id=trunk_id,
        sip_call_to=phone_number,
        room_name=room,
        participant_identity=f"outbound_{phone_number}",
        participant_name=f"Outbound call to {phone_number}",
        krisp_enabled=True,
    )

    resp = await lk_api.sip.create_sip_participant(req)
    print(f"Outbound call initiated to {phone_number}. Room: {room}")
    print(f"Participant: {resp}")
    await lk_api.aclose()
    return resp


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python examples/outbound_call.py +15551234567")
        sys.exit(1)

    target = sys.argv[1]
    asyncio.run(make_outbound_call(target))
