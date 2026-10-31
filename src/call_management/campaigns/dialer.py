"""Network edge for one outbound dial. Tests replace ``place_outbound_call``."""

from __future__ import annotations

import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

TRUNK_UNSET_MESSAGE = (
    "Configura el troncal de salida en Configuración antes de iniciar la campaña."
)


@dataclass(frozen=True)
class DialRequest:
    trunk_id: str
    phone: str
    room_name: str
    participant_identity: str
    participant_name: str
    metadata: str


Dialer = Callable[[DialRequest], Awaitable[None]]

_dialer: Dialer | None = None


def outbound_trunk_id() -> str:
    """Outbound trunk from the process environment. Empty means it is unset."""
    return os.getenv("SIP_TRUNK_ID", "").strip()


def set_campaign_dialer(dialer: Dialer | None) -> None:
    global _dialer
    _dialer = dialer


def get_campaign_dialer() -> Dialer:
    return _dialer or livekit_place_call


async def livekit_place_call(request: DialRequest) -> None:
    """Create the agent dispatch and the SIP participant. This is the only network call."""
    from livekit import api

    from call_management.telephony.inbound_setup import AGENT_NAME

    lk = api.LiveKitAPI(
        url=os.environ["LIVEKIT_URL"],
        api_key=os.environ["LIVEKIT_API_KEY"],
        api_secret=os.environ["LIVEKIT_API_SECRET"],
    )
    try:
        await lk.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(
                agent_name=AGENT_NAME,
                room=request.room_name,
                metadata=request.metadata,
            )
        )
        await lk.sip.create_sip_participant(
            api.CreateSIPParticipantRequest(
                sip_trunk_id=request.trunk_id,
                sip_call_to=request.phone,
                room_name=request.room_name,
                participant_identity=request.participant_identity,
                participant_name=request.participant_name,
                krisp_enabled=True,
            )
        )
    finally:
        await lk.aclose()
