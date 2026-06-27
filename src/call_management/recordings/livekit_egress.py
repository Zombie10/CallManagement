"""Optional LiveKit room composite egress for SIP / LiveKit voice recordings."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

logger = logging.getLogger("call-management.recordings.egress")


def egress_configured() -> bool:
    return bool(os.getenv("RECORDINGS_S3_BUCKET", "").strip())


def _s3_upload() -> Any:
    from livekit.protocol.egress import S3Upload

    return S3Upload(
        access_key=os.environ["RECORDINGS_S3_ACCESS_KEY"],
        secret=os.environ["RECORDINGS_S3_SECRET"],
        bucket=os.environ["RECORDINGS_S3_BUCKET"],
        region=os.getenv("RECORDINGS_S3_REGION", "us-east-1"),
        endpoint=os.getenv("RECORDINGS_S3_ENDPOINT", ""),
        force_path_style=os.getenv("RECORDINGS_S3_FORCE_PATH_STYLE", "false").lower() == "true",
    )


async def start_room_audio_recording(*, room_name: str, call_id: str, tenant_id: str | None) -> str | None:
    """Start audio-only room composite egress. Returns egress_id or None if skipped."""
    if not egress_configured():
        return None

    url = os.getenv("LIVEKIT_URL", "")
    api_key = os.getenv("LIVEKIT_API_KEY", "")
    api_secret = os.getenv("LIVEKIT_API_SECRET", "")
    if not (url and api_key and api_secret):
        logger.warning("LiveKit creds missing — cannot start egress")
        return None

    prefix = os.getenv("RECORDINGS_S3_PREFIX", "callmanagement/recordings").strip("/")
    tid = tenant_id or "global"
    filepath = f"{prefix}/{tid}/{call_id}.ogg"

    from livekit import api
    from livekit.protocol.egress import EncodedFileOutput, EncodedFileType, RoomCompositeEgressRequest

    output = EncodedFileOutput(
        file_type=EncodedFileType.OGG,
        filepath=filepath,
        s3=_s3_upload(),
    )

    try:
        async with api.LiveKitAPI(url, api_key, api_secret) as lkapi:
            info = await lkapi.egress.start_room_composite_egress(
                RoomCompositeEgressRequest(
                    room_name=room_name,
                    audio_only=True,
                    file=output,
                )
            )
            logger.info("Started egress %s for room %s", info.egress_id, room_name)
            return info.egress_id
    except Exception:
        logger.exception("Failed to start room egress for %s", room_name)
        return None


async def resolve_egress_recording_url(egress_id: str, *, timeout_sec: float = 45.0) -> str | None:
    """Poll egress until complete and return file URL (typically S3/MinIO)."""
    if not egress_id or not egress_configured():
        return None

    url = os.getenv("LIVEKIT_URL", "")
    api_key = os.getenv("LIVEKIT_API_KEY", "")
    api_secret = os.getenv("LIVEKIT_API_SECRET", "")
    if not (url and api_key and api_secret):
        return None

    from livekit import api
    from livekit.protocol.egress import EgressStatus, ListEgressRequest

    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_sec
    async with api.LiveKitAPI(url, api_key, api_secret) as lkapi:
        while loop.time() < deadline:
            try:
                resp = await lkapi.egress.list_egress(ListEgressRequest(egress_id=egress_id))
                for item in resp.items:
                    if item.status == EgressStatus.EGRESS_COMPLETE:
                        for f in item.file_results:
                            if f.location:
                                return f.location
                        return None
                    if item.status in (EgressStatus.EGRESS_FAILED, EgressStatus.EGRESS_ABORTED):
                        logger.warning("Egress %s failed: %s", egress_id, item.error)
                        return None
            except Exception:
                logger.exception("Egress poll error for %s", egress_id)
                return None
            await asyncio.sleep(2.0)
    return None