"""Execute CRM / routing function tools for browser xAI Voice sessions."""

from __future__ import annotations

import time
from typing import Any

from call_management.agents.registry import resolve_handoff_target
from call_management.crm.banking_data import format_customer_lookup, get_demo_customer, normalize_phone
from call_management.crm.database import get_crm

# Generic playground defaults — not real callers until the agent collects a number.
_PLACEHOLDER_PHONES = frozenset({"", "+15551234567", "+10000000000"})


def _tool_result(
    *,
    function_name: str,
    output: str,
    arguments: dict[str, Any],
    started: float,
    handoff_agent: str | None = None,
    event: dict[str, str] | None = None,
    status: str = "ok",
) -> dict[str, Any]:
    elapsed = int((time.perf_counter() - started) * 1000)
    payload: dict[str, Any] = {
        "output": output,
        "tool": function_name,
        "arguments": arguments,
        "status": status,
        "duration_ms": elapsed,
    }
    if handoff_agent:
        payload["handoff_agent"] = handoff_agent
    if event:
        payload["event"] = event
    return payload


async def execute_voice_function(
    *,
    function_name: str,
    arguments: dict[str, Any] | None = None,
    phone_number: str,
    customer_name: str | None = None,
) -> dict[str, Any]:
    """Run a voice function tool server-side and return output for function_call_output."""
    started = time.perf_counter()
    args = arguments or {}
    name = function_name.strip()
    phone = normalize_phone(phone_number)

    handoff = resolve_handoff_target(name)
    if handoff:
        reason = str(args.get("reason") or "").strip()
        return _tool_result(
            function_name=name,
            output=f"Transferred to {handoff}. Reason: {reason or 'routing'}",
            arguments=args,
            started=started,
            handoff_agent=handoff,
            event={"type": "handoff", "detail": handoff},
        )

    crm = await get_crm()
    active_phone = phone

    if name == "lookup_customer":
        arg_phone = str(args.get("phone_number") or "").strip()
        lookup_phone = normalize_phone(arg_phone) if arg_phone else ""
        if not lookup_phone or lookup_phone in _PLACEHOLDER_PHONES:
            if phone not in _PLACEHOLDER_PHONES:
                lookup_phone = phone
            else:
                return _tool_result(
                    function_name=name,
                    output=(
                        "Aún no tengo teléfono confirmado. "
                        "Pregunta al cliente su número y vuelve a buscar con ese dato."
                    ),
                    arguments=args,
                    started=started,
                    status="error",
                )
        active_phone = lookup_phone

    customer = await crm.get_or_create_customer(active_phone)
    if customer_name and not customer.name:
        customer.name = customer_name
        await crm.update_customer(customer)

    demo = get_demo_customer(active_phone)

    if name == "lookup_customer":
        if demo:
            output = format_customer_lookup(demo)
        elif customer.name:
            output = (
                f"Customer found: {customer.name}, phone {active_phone}. "
                f"VIP: {'yes' if customer.vip else 'no'}. "
                f"Notes: {customer.notes or 'none'}."
            )
        else:
            output = f"Phone {active_phone} on file. No name registered yet."
        return _tool_result(function_name=name, output=output, arguments=args, started=started)

    if name == "verify_bac_account":
        last4 = str(args.get("account_last_four") or "").strip()[-4:]
        if not demo:
            return _tool_result(
                function_name=name,
                output="No banking profile for this phone number.",
                arguments=args,
                started=started,
                status="error",
            )
        expected = demo.banking.account_number[-4:]
        if last4 == expected:
            output = (
                f"Cuenta verificada. {demo.banking.institution} — "
                f"{demo.banking.account_type} ****{last4}."
            )
            return _tool_result(function_name=name, output=output, arguments=args, started=started)
        return _tool_result(
            function_name=name,
            output="Los últimos 4 dígitos de cuenta no coinciden.",
            arguments=args,
            started=started,
            status="error",
        )

    if name == "verify_debit_card":
        last4 = str(args.get("card_last_four") or "").strip()[-4:]
        expiry = str(args.get("expiry") or "").strip()
        if not demo:
            return _tool_result(
                function_name=name,
                output="No debit card on file for this number.",
                arguments=args,
                started=started,
                status="error",
            )
        if last4 != demo.banking.debit_card_last4:
            return _tool_result(
                function_name=name,
                output="Los últimos 4 dígitos de tarjeta no coinciden.",
                arguments=args,
                started=started,
                status="error",
            )
        if expiry and expiry != demo.banking.debit_card_exp:
            return _tool_result(
                function_name=name,
                output="Tarjeta parcialmente correcta pero vencimiento incorrecto.",
                arguments=args,
                started=started,
                status="error",
            )
        output = (
            f"Tarjeta débito verificada: {demo.banking.debit_card_masked} "
            f"(vence {demo.banking.debit_card_exp})."
        )
        return _tool_result(function_name=name, output=output, arguments=args, started=started)

    if name in ("block_debit_card", "block_debit_card_temporarily"):
        reason = str(args.get("reason") or "").strip()
        if not reason:
            return _tool_result(
                function_name=name,
                output="Indica el motivo del bloqueo.",
                arguments=args,
                started=started,
                status="error",
            )
        note = f"[Bloqueo temporal débito] {reason}"
        await crm.add_customer_note(phone, note)
        last4 = demo.banking.debit_card_last4 if demo else "????"
        output = f"Tarjeta débito ****{last4} bloqueada temporalmente."
        return _tool_result(function_name=name, output=output, arguments=args, started=started)

    if name == "get_account_summary":
        if not demo:
            return _tool_result(
                function_name=name,
                output="Primero identifica al cliente con lookup_customer.",
                arguments=args,
                started=started,
                status="error",
            )
        b = demo.banking
        parts = [
            f"{demo.name} — {b.institution}",
            f"Cuenta {b.account_type}: ****{b.account_number[-4:]}",
            f"Débito: {b.debit_card_masked}",
        ]
        if b.credit_card_masked:
            parts.append(f"Crédito: {b.credit_card_masked}")
        parts.append(f"Productos: {', '.join(b.products)}")
        return _tool_result(
            function_name=name,
            output=". ".join(parts) + ".",
            arguments=args,
            started=started,
        )

    if name == "update_customer_name":
        new_name = str(args.get("name") or args.get("customer_name") or customer_name or "").strip()
        if not new_name:
            return _tool_result(
                function_name=name,
                output="No name provided to update.",
                arguments=args,
                started=started,
                status="error",
            )
        customer.name = new_name
        await crm.update_customer(customer)
        return _tool_result(
            function_name=name,
            output=f"Customer name updated to {new_name}.",
            arguments=args,
            started=started,
        )

    if name == "add_call_note":
        note = str(args.get("note") or args.get("reason") or "").strip()
        if not note:
            return _tool_result(
                function_name=name,
                output="No note text provided.",
                arguments=args,
                started=started,
                status="error",
            )
        await crm.add_customer_note(phone, note)
        return _tool_result(function_name=name, output="Note saved to CRM.", arguments=args, started=started)

    if name == "schedule_appointment":
        from call_management.scheduling.calendar import schedule_appointment

        purpose = str(args.get("purpose") or args.get("reason") or "Callback").strip()
        when = str(args.get("scheduled_time") or args.get("time") or "").strip()
        if not when:
            return _tool_result(
                function_name=name,
                output="Ask the caller for a preferred date and time (ISO format preferred).",
                arguments=args,
                started=started,
                status="error",
            )
        try:
            _, details = await schedule_appointment(
                crm=crm,
                customer_phone=phone,
                scheduled_time=when,
                purpose=purpose,
            )
            return _tool_result(
                function_name=name,
                output=f"Appointment scheduled: {details}",
                arguments=args,
                started=started,
            )
        except Exception as exc:
            return _tool_result(
                function_name=name,
                output=f"Could not schedule appointment: {exc}",
                arguments=args,
                started=started,
                status="error",
            )

    if name in ("escalate_to_human", "end_call_gracefully"):
        return _tool_result(
            function_name=name,
            output=f"Acknowledged {name}. Continue assisting the caller in voice mode.",
            arguments=args,
            started=started,
            event={"type": "tool_call", "detail": name},
        )

    return _tool_result(
        function_name=name,
        output=f"Function {name} acknowledged.",
        arguments=args,
        started=started,
    )