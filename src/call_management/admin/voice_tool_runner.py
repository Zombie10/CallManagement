"""Execute CRM / routing function tools for browser xAI Voice sessions."""

from __future__ import annotations

import json
from typing import Any

from call_management.agents.registry import resolve_handoff_target
from call_management.crm.database import Customer, get_crm


async def execute_voice_function(
    *,
    function_name: str,
    arguments: dict[str, Any] | None = None,
    phone_number: str,
    customer_name: str | None = None,
) -> dict[str, Any]:
    """Run a voice function tool server-side and return output for function_call_output."""
    args = arguments or {}
    name = function_name.strip()

    handoff = resolve_handoff_target(name)
    if handoff:
        reason = str(args.get("reason") or "").strip()
        return {
            "output": f"Transferred to {handoff}. Reason: {reason or 'routing'}",
            "handoff_agent": handoff,
            "event": {"type": "handoff", "detail": handoff},
        }

    crm = await get_crm()
    customer = await crm.get_or_create_customer(phone_number)
    if customer_name and not customer.name:
        customer.name = customer_name
        await crm.update_customer(customer)

    if name == "lookup_customer":
        if customer.name:
            output = (
                f"Customer found: {customer.name}, phone {phone_number}. "
                f"VIP: {'yes' if customer.vip else 'no'}. "
                f"Notes: {customer.notes or 'none'}."
            )
        else:
            output = f"Phone {phone_number} on file. No name registered yet."
        return {"output": output}

    if name == "update_customer_name":
        new_name = str(args.get("name") or args.get("customer_name") or customer_name or "").strip()
        if not new_name:
            return {"output": "No name provided to update."}
        customer.name = new_name
        await crm.update_customer(customer)
        return {"output": f"Customer name updated to {new_name}."}

    if name == "add_call_note":
        note = str(args.get("note") or args.get("reason") or "").strip()
        if not note:
            return {"output": "No note text provided."}
        await crm.add_customer_note(phone_number, note)
        return {"output": "Note saved to CRM."}

    if name == "schedule_appointment":
        from call_management.scheduling.calendar import schedule_appointment

        purpose = str(args.get("purpose") or args.get("reason") or "Callback").strip()
        when = str(args.get("scheduled_time") or args.get("time") or "").strip()
        if not when:
            return {"output": "Ask the caller for a preferred date and time (ISO format preferred)."}
        try:
            _, details = await schedule_appointment(
                crm=crm,
                customer_phone=phone_number,
                scheduled_time=when,
                purpose=purpose,
            )
            return {"output": f"Appointment scheduled: {details}"}
        except Exception as exc:
            return {"output": f"Could not schedule appointment: {exc}"}

    if name in ("escalate_to_human", "end_call_gracefully"):
        return {
            "output": f"Acknowledged {name}. Continue assisting the caller in voice mode.",
            "event": {"type": "tool_call", "detail": name},
        }

    return {"output": f"Function {name} acknowledged."}