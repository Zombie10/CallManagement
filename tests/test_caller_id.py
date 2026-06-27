from livekit import rtc

from call_management.telephony.caller_id import (
    phone_from_participant,
    phone_from_room_name,
    resolve_caller_phone,
)


class _FakeParticipant:
    def __init__(
        self,
        *,
        kind=rtc.ParticipantKind.PARTICIPANT_KIND_SIP,
        identity: str = "",
        attributes: dict[str, str] | None = None,
    ):
        self.kind = kind
        self.identity = identity
        self.attributes = attributes or {}


def test_resolve_from_sip_attribute():
    participant = _FakeParticipant(attributes={"sip.phoneNumber": "+15105551234"})
    assert resolve_caller_phone(room_name="call-abc", participants=[participant]) == "+15105551234"


def test_resolve_from_metadata_when_no_sip():
    assert (
        resolve_caller_phone(
            room_name="admin-voice-abc",
            metadata_phone="+15551234567",
            participants=[],
        )
        == "+15551234567"
    )


def test_resolve_from_room_name():
    assert resolve_caller_phone(room_name="call-+15105559999-123") == "+15105559999"


def test_phone_from_participant_ignores_unknown_identity():
    participant = _FakeParticipant(identity="sip_abc123")
    assert phone_from_participant(participant) is None


def test_phone_from_participant_uses_e164_identity():
    participant = _FakeParticipant(identity="+15103750043")
    assert phone_from_participant(participant) == "+15103750043"