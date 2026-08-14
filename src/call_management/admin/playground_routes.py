"""Playground, chat, and browser voice routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from call_management.admin.chat_runner import get_chat_manager
from call_management.admin.interaction_complete import complete_voice_xai_session
from call_management.admin.livekit_playground import (
    create_livekit_playground_session,
    livekit_playground_ready,
)
from call_management.admin.schemas import (
    ChatMessagePayload,
    ChatSessionCreate,
    LiveKitPlaygroundCreate,
    VoiceSessionComplete,
    VoiceSessionCreate,
    VoiceToolExecute,
)
from call_management.admin.tenant_deps import (
    playground_actor,
    require_tenant_context,
    scoped_playground_context,
)
from call_management.admin.voice_session import create_browser_voice_session
from call_management.admin.voice_tool_runner import execute_voice_function
from call_management.tenancy.platform_store import get_platform_store

router = APIRouter(tags=["playground"])


@router.get("/api/chat/status")
async def chat_status():
    return get_chat_manager().status()


@router.post("/api/chat/sessions")
async def create_chat_session(payload: ChatSessionCreate, request: Request):
    ctx = scoped_playground_context(
        request, tenant_id=payload.tenant_id, agent_instance_id=payload.agent_instance_id
    )
    actor = playground_actor(request)
    try:
        return await get_chat_manager().create(
            phone_number=payload.phone_number,
            customer_name=payload.customer_name,
            department=payload.department,
            initial_agent=payload.initial_agent,
            tenant_id=ctx.tenant.id,
            agent_instance_id=ctx.agent_instance.id if ctx.agent_instance else payload.agent_instance_id,
            vip=payload.vip,
            user_id=str(actor["id"]),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="No se pudo crear la sesión de chat") from exc


@router.post("/api/chat/sessions/{session_id}/messages")
async def send_chat_message(session_id: str, payload: ChatMessagePayload, request: Request):
    actor = playground_actor(request)
    try:
        return await get_chat_manager().send_message(
            session_id, payload.message, user_id=str(actor["id"])
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="No se pudo enviar el mensaje") from exc


@router.post("/api/chat/sessions/{session_id}/reset")
async def reset_chat_session(session_id: str, request: Request):
    actor = playground_actor(request)
    try:
        return await get_chat_manager().reset(session_id, user_id=str(actor["id"]))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/api/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str, request: Request):
    actor = playground_actor(request)
    try:
        await get_chat_manager().close(session_id, user_id=str(actor["id"]))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return {"deleted": session_id}


@router.post("/api/voice/session")
async def create_voice_session(payload: VoiceSessionCreate, request: Request):
    ctx = scoped_playground_context(
        request, tenant_id=payload.tenant_id, agent_instance_id=payload.agent_instance_id
    )
    actor = playground_actor(request)
    try:
        created = await create_browser_voice_session(
            agent_name=payload.agent,
            tenant_id=ctx.tenant.id,
            agent_instance_id=ctx.agent_instance.id if ctx.agent_instance else payload.agent_instance_id,
        )
        from call_management.admin.playground_sessions import register_lease

        register_lease(
            created["call_id"],
            user_id=str(actor["id"]),
            tenant_id=ctx.tenant.id,
            kind="voice",
        )
        return created
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="No se pudo crear la sesión de voz") from exc


@router.post("/api/voice/complete")
async def complete_voice_session(payload: VoiceSessionComplete, request: Request):
    actor = playground_actor(request)
    from call_management.admin.playground_sessions import require_lease

    try:
        lease = require_lease(payload.call_id, user_id=str(actor["id"]), kind="voice")
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    ctx = scoped_playground_context(
        request, tenant_id=lease.tenant_id, agent_instance_id=payload.agent_instance_id
    )
    try:
        return await complete_voice_xai_session(
            call_id=payload.call_id,
            agent=payload.agent,
            phone_number=payload.phone_number,
            customer_name=payload.customer_name,
            tenant_id=ctx.tenant.id,
            agent_instance_id=ctx.agent_instance.id if ctx.agent_instance else payload.agent_instance_id,
            start_time=payload.start_time,
            transcript=payload.transcript,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="No se pudo guardar la sesión de voz") from exc


@router.post("/api/voice/tools/execute")
async def execute_voice_tool(payload: VoiceToolExecute, request: Request):
    actor = playground_actor(request)
    ctx = scoped_playground_context(
        request, tenant_id=payload.tenant_id, agent_instance_id=payload.agent_instance_id
    )
    try:
        return await execute_voice_function(
            function_name=payload.function_name,
            arguments=payload.arguments,
            phone_number=payload.phone_number,
            customer_name=payload.customer_name,
            tenant_id=ctx.tenant.id,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="No se pudo ejecutar la herramienta") from exc


@router.get("/api/playground/agents")
async def playground_agents(ctx=Depends(require_tenant_context)):
    store = get_platform_store()
    agents = store.list_agents(ctx.tenant.id)
    return {
        "tenant": {
            "id": ctx.tenant.id,
            "name": ctx.tenant.name,
            "slug": ctx.tenant.slug,
        },
        "agents": [
            {
                "id": a.id,
                "display_name": a.display_name,
                "template_id": a.template_id,
                "status": a.status,
                "phone_number": a.phone_number or None,
            }
            for a in agents
        ],
    }


@router.get("/api/livekit/status")
async def livekit_status():
    ready, issues = livekit_playground_ready()
    return {"ready": ready, "issues": issues, "requires_worker": True}


@router.post("/api/livekit/playground")
async def create_livekit_playground(payload: LiveKitPlaygroundCreate, request: Request):
    ctx = scoped_playground_context(
        request, tenant_id=payload.tenant_id, agent_instance_id=payload.agent_instance_id
    )
    try:
        return await create_livekit_playground_session(
            initial_agent=payload.initial_agent,
            phone_number=payload.phone_number,
            customer_name=payload.customer_name,
            tenant_id=ctx.tenant.id,
            agent_instance_id=ctx.agent_instance.id if ctx.agent_instance else payload.agent_instance_id,
            vip=payload.vip,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="No se pudo crear el playground LiveKit") from exc
