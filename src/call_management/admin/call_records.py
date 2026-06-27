"""Admin API for interaction records (list, detail, recordings)."""

from __future__ import annotations

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse

from call_management.recordings.store import (
    find_recording_file,
    guess_media_type,
    recording_api_url,
    save_recording_bytes,
)
from call_management.tenancy.context import resolve_crm_for_tenant


def _row_to_item(row: dict) -> dict:
    return {
        "call_id": row["call_id"],
        "room_name": row["room_name"],
        "from_number": row["from_number"],
        "to_number": row["to_number"],
        "start_time": row["start_time"],
        "end_time": row["end_time"],
        "outcome": row["outcome"],
        "summary": row["summary"],
        "duration_seconds": row["duration_seconds"],
        "transferred_to": row["transferred_to"],
        "agent_notes": row.get("agent_notes"),
        "transcript": row.get("transcript"),
        "recording_url": row.get("recording_url"),
        "agent_instance_id": row.get("agent_instance_id"),
        "channel": row.get("channel") or "sip",
    }


async def list_calls_for_tenant(ctx, *, limit: int = 50, offset: int = 0) -> dict:
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    return await crm.list_call_records(limit=limit, offset=offset)


async def get_call_for_tenant(ctx, call_id: str) -> dict:
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    row = await crm.get_call_record_row(call_id)
    if not row:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    item = _row_to_item(row)
    if not item["recording_url"] and find_recording_file(ctx.tenant.id, call_id):
        item["recording_url"] = recording_api_url(call_id)
    return item


async def upload_call_recording(ctx, call_id: str, file: UploadFile) -> dict:
    from call_management.crm.database import CallRecord
    from call_management.utils.time import utc_now_iso

    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    row = await crm.get_call_record_row(call_id)
    if not row:
        await crm.create_call_record(
            CallRecord(
                call_id=call_id,
                room_name="browser-recording",
                from_number="+15551234567",
                start_time=utc_now_iso(),
                channel="voice_livekit",
            )
        )

    data = await file.read()
    ext = "webm"
    if file.filename and "." in file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()
    save_recording_bytes(ctx.tenant.id, call_id, data, ext=ext)
    url = recording_api_url(call_id)
    await crm.update_call_recording(call_id, url)
    return {"saved": True, "call_id": call_id, "recording_url": url, "bytes": len(data)}


async def stream_call_recording(ctx, call_id: str) -> FileResponse:
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    row = await crm.get_call_record_row(call_id)
    if not row:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    path = find_recording_file(ctx.tenant.id, call_id)
    if not path:
        raise HTTPException(status_code=404, detail="Grabación no disponible")

    return FileResponse(
        path,
        media_type=guess_media_type(path),
        filename=path.name,
        headers={"Accept-Ranges": "bytes"},
    )