"""SIP / Telephony control tools for LiveKit Agents.

These tools allow the AI agent (or your backend) to:
- End the current call
- Perform cold/warm transfers
- Add additional SIP participants (conferencing)
- Look up SIP metadata

All tools are designed to be used as @function_tool inside Agent classes.
They require a JobContext with a valid LiveKit API client.
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import Any

from livekit import api, rtc
from livekit.agents import JobContext, RunContext, function_tool

logger = logging.getLogger("call-management.sip")


class SIPManager:
    """Helper that holds the JobContext and exposes high-level SIP operations.

    Instantiate once per session and pass to agents via userdata or closure.
    """

    def __init__(self, ctx: JobContext) -> None:
        self.ctx = ctx
        self.room_name = ctx.room.name
        self.sip_trunk_id = os.getenv("SIP_TRUNK_ID")

    # ---------- Low-level helpers ----------

    def _get_sip_caller(self) -> rtc.RemoteParticipant | None:
        """Find the primary SIP caller in the room."""
        for p in self.ctx.room.remote_participants.values():
            if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
                return p
        return None

    def get_sip_attributes(self) -> dict[str, str]:
        """Return useful SIP attributes from the current caller (if any)."""
        p = self._get_sip_caller()
        if not p or not p.attributes:
            return {}
        return {
            "call_id": p.attributes.get("sip.callID", ""),
            "phone_number": p.attributes.get("sip.phoneNumber", ""),
            "trunk_id": p.attributes.get("sip.trunkID", ""),
            "trunk_phone": p.attributes.get("sip.trunkPhoneNumber", ""),
            "call_status": p.attributes.get("sip.callStatus", ""),
        }

    async def end_room(self) -> None:
        """Delete the room (ends the entire call for everyone)."""
        await self.ctx.api.room.delete_room(api.DeleteRoomRequest(room=self.room_name))

    async def create_sip_participant(
        self,
        phone_number: str,
        participant_identity: str | None = None,
        participant_name: str | None = None,
        krisp_enabled: bool = True,
    ) -> api.SIPParticipantInfo:
        """Dial out to a phone number and add them to the current room."""
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
        logger.info(f"Created SIP participant {identity} -> {phone_number}")
        return resp

    async def transfer_sip_participant(
        self,
        participant_identity: str,
        destination: str,  # phone number or SIP URI
        play_dtmf: str | None = None,
    ) -> None:
        """Cold transfer a SIP participant to another number/SIP endpoint.

        After this, the original room will no longer have that participant.
        """
        req = api.TransferSIPParticipantRequest(
            participant_identity=participant_identity,
            room_name=self.room_name,
            transfer_to=destination,
            play_dtmf=play_dtmf,
        )
        await self.ctx.api.sip.transfer_sip_participant(req)
        logger.info(f"Transferred {participant_identity} -> {destination}")

    # ---------- High-level agent-friendly operations ----------

    async def end_current_call(self, farewell: str | None = None) -> str:
        """Gracefully end the call. Optionally play a farewell message first."""
        if farewell:
            # The caller of this method is responsible for saying it via the session
            pass
        await self.end_room()
        return "Call ended successfully."

    async def warm_transfer(self, phone_number: str, context_summary: str | None = None) -> str:
        """Perform a warm transfer: dial the target, wait for answer, then bridge or hand off.

        For simplicity in this reference implementation we do a basic blind transfer
        after dialing. Real warm transfers often involve an intermediate "consultation"
        leg. Extend this method for more sophisticated behavior.
        """
        try:
            await self.create_sip_participant(
                phone_number,
                participant_name=f"Transfer target {phone_number}",
            )
            # In a real warm transfer you would monitor the new participant,
            # confirm they are ready, then either:
            #   - leave both in the room (conference), or
            #   - use TransferSIPParticipant on the original caller.
            # Here we do a simple transfer of the original caller.
            caller = self._get_sip_caller()
            if caller:
                await self.transfer_sip_participant(
                    caller.identity,
                    phone_number,
                )
            return f"Warm transfer initiated to {phone_number}."
        except Exception as e:
            logger.exception("Warm transfer failed")
            return f"Failed to warm transfer: {e}"

    async def cold_transfer(self, phone_number: str) -> str:
        """Immediately transfer the current SIP caller to the target number."""
        caller = self._get_sip_caller()
        if not caller:
            return "No SIP caller found in room to transfer."

        try:
            await self.transfer_sip_participant(caller.identity, phone_number)
            return f"Cold transfer completed to {phone_number}."
        except Exception as e:
            logger.exception("Cold transfer failed")
            return f"Failed to transfer: {e}"

    async def add_conference_participant(self, phone_number: str) -> str:
        """Add another person to the current call (3-way / conference)."""
        try:
            await self.create_sip_participant(phone_number)
            return f"Added {phone_number} to the call."
        except Exception as e:
            logger.exception("Failed to add conference participant")
            return f"Could not add {phone_number}: {e}"


# ------------------- Function Tools (usable directly in Agent) -------------------


def make_sip_tools(sip: SIPManager):
    """Factory that returns a list of ready-to-use @function_tool functions bound to a SIPManager."""

    @function_tool
    async def end_call(context: RunContext) -> str:
        """End the current phone call immediately. Use when the conversation is complete."""
        return await sip.end_current_call()

    @function_tool
    async def transfer_to(
        phone_number: str,
        transfer_type: str = "cold",  # "cold" or "warm"
        context: RunContext | None = None,
    ) -> str:
        """Transfer the caller to another phone number.

        Args:
            phone_number: Destination phone number in E.164 or local format
            transfer_type: "cold" for immediate transfer, "warm" for assisted transfer
        """
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
