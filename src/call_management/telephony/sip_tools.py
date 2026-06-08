"""SIP / Telephony control tools for LiveKit Agents."""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from typing import Any

from livekit import api, rtc
from livekit.agents import JobContext, RunContext, function_tool

logger = logging.getLogger("call-management.sip")

WARM_TRANSFER_WAIT_SECONDS = float(os.getenv("WARM_TRANSFER_WAIT_SECONDS", "8"))


class SIPManager:
    """Helper that holds the JobContext and exposes high-level SIP operations."""

    def __init__(self, ctx: JobContext) -> None:
        self.ctx = ctx
        self.room_name = ctx.room.name
        self.sip_trunk_id = os.getenv("SIP_TRUNK_ID")

    def _get_sip_caller(self) -> rtc.RemoteParticipant | None:
        for participant in self.ctx.room.remote_participants.values():
            if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
                return participant
        return None

    def get_sip_attributes(self) -> dict[str, str]:
        participant = self._get_sip_caller()
        if not participant or not participant.attributes:
            return {}
        return {
            "call_id": participant.attributes.get("sip.callID", ""),
            "phone_number": participant.attributes.get("sip.phoneNumber", ""),
            "trunk_id": participant.attributes.get("sip.trunkID", ""),
            "trunk_phone": participant.attributes.get("sip.trunkPhoneNumber", ""),
            "call_status": participant.attributes.get("sip.callStatus", ""),
        }

    async def end_room(self) -> None:
        await self.ctx.api.room.delete_room(api.DeleteRoomRequest(room=self.room_name))

    async def create_sip_participant(
        self,
        phone_number: str,
        participant_identity: str | None = None,
        participant_name: str | None = None,
        krisp_enabled: bool = True,
    ) -> api.SIPParticipantInfo:
        if not self.sip_trunk_id:
            raise RuntimeError("SIP_TRUNK_ID environment variable is not set")

        identity = participant_identity or f"sip_{uuid.uuid4().hex[:10]}"
        name = participant_name or f"Outbound {phone_number}"

        req = api.CreateSIPParticipantRequest(
            sip_trunk_id=self.sip_trunk_id,
            sip_call_to=phone_number,
            room_name=self.room_name,
            participant_identity=identity,
            participant_name=name,
            krisp_enabled=krisp_enabled,
        )
        resp = await self.ctx.api.sip.create_sip_participant(req)
        logger.info("Created SIP participant %s -> %s", identity, phone_number)
        return resp

    async def transfer_sip_participant(
        self,
        participant_identity: str,
        destination: str,
        play_dtmf: str | None = None,
    ) -> None:
        req = api.TransferSIPParticipantRequest(
            participant_identity=participant_identity,
            room_name=self.room_name,
            transfer_to=destination,
            play_dtmf=play_dtmf,
        )
        await self.ctx.api.sip.transfer_sip_participant(req)
        logger.info("Transferred %s -> %s", participant_identity, destination)

    async def _wait_for_participant(self, identity: str, max_wait_seconds: float) -> bool:
        elapsed = 0.0
        interval = 0.5
        while elapsed < max_wait_seconds:
            if identity in self.ctx.room.remote_participants:
                participant = self.ctx.room.remote_participants[identity]
                status = (participant.attributes or {}).get("sip.callStatus", "")
                if status in ("active", "answered", ""):
                    return True
            await asyncio.sleep(interval)
            elapsed += interval
        return False

    async def end_current_call(self, farewell: str | None = None) -> str:
        if farewell:
            logger.info("Farewell message provided before hangup: %s", farewell[:120])
        await self.end_room()
        return "Call ended successfully."

    async def warm_transfer(self, phone_number: str, context_summary: str | None = None) -> str:
        """Dial the target, wait briefly for answer, then transfer the caller."""
        try:
            identity = f"sip_{uuid.uuid4().hex[:10]}"
            await self.create_sip_participant(
                phone_number,
                participant_identity=identity,
                participant_name=f"Transfer target {phone_number}",
            )
            if context_summary:
                logger.info("Warm transfer context: %s", context_summary[:300])

            answered = await self._wait_for_participant(identity, WARM_TRANSFER_WAIT_SECONDS)
            if not answered:
                return (
                    f"Could not confirm that {phone_number} answered within "
                    f"{int(WARM_TRANSFER_WAIT_SECONDS)} seconds."
                )

            caller = self._get_sip_caller()
            if caller:
                await self.transfer_sip_participant(caller.identity, phone_number)
            return f"Warm transfer completed to {phone_number}."
        except Exception as exc:
            logger.exception("Warm transfer failed")
            return f"Failed to warm transfer: {exc}"

    async def cold_transfer(self, phone_number: str) -> str:
        caller = self._get_sip_caller()
        if not caller:
            return "No SIP caller found in room to transfer."

        try:
            await self.transfer_sip_participant(caller.identity, phone_number)
            return f"Cold transfer completed to {phone_number}."
        except Exception as exc:
            logger.exception("Cold transfer failed")
            return f"Failed to transfer: {exc}"

    async def add_conference_participant(self, phone_number: str) -> str:
        try:
            await self.create_sip_participant(phone_number)
            return f"Added {phone_number} to the call."
        except Exception as exc:
            logger.exception("Failed to add conference participant")
            return f"Could not add {phone_number}: {exc}"


def make_sip_tools(sip: SIPManager):
    """Factory that returns SIP tools bound to a SIPManager."""

    @function_tool
    async def end_call(context: RunContext) -> str:
        """End the current phone call immediately. Use when the conversation is complete."""
        return await sip.end_current_call()

    @function_tool
    async def transfer_to(
        phone_number: str,
        transfer_type: str = "cold",
        context: RunContext | None = None,
    ) -> str:
        """Transfer the caller to another phone number."""
        if transfer_type.lower() == "warm":
            return await sip.warm_transfer(phone_number)
        return await sip.cold_transfer(phone_number)

    @function_tool
    async def add_to_call(phone_number: str, context: RunContext) -> str:
        """Add another person to the current call (conference / 3-way calling)."""
        return await sip.add_conference_participant(phone_number)

    @function_tool
    async def get_caller_info(context: RunContext) -> dict[str, Any]:
        """Return information about the current SIP caller (phone, trunk, status)."""
        return sip.get_sip_attributes()

    return [end_call, transfer_to, add_to_call, get_caller_info]
