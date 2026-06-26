"""BAC Credomatic banking support agent."""

from __future__ import annotations

from typing import Annotated

from livekit.agents.llm import function_tool
from pydantic import Field

from call_management.agents.base import BaseAgent, RunContextT
from call_management.config import get_model_config, get_voice_for_agent
from call_management.crm.banking_data import get_demo_customer, normalize_phone


class BankingSupportAgent(BaseAgent):
    def __init__(self) -> None:
        cfg = get_model_config()
        super().__init__(
            name="banking_support",
            preferred_voice=get_voice_for_agent("banking_support", cfg.provider),
            instructions=(
                "Eres especialista de BAC Credomatic atendiendo llamadas. "
                "Ayudas con cuentas, tarjetas, bloqueos y transferencias.\n\n"
                "Abre breve: «BAC Credomatic, buenos días, ¿en qué le puedo ayudar?»\n"
                "Escucha el motivo primero. Solo pide el teléfono registrado cuando necesites "
                "identificar al cliente para un trámite (bloqueo, consulta de productos, etc.) — "
                "no hagas un cuestionario de nombre y datos.\n"
                "Usa lookup_customer únicamente con el número que el cliente te diga.\n"
                "Para datos sensibles, pide los últimos 4 dígitos de cuenta o tarjeta cuando toque.\n"
                "Nunca reveles números completos de tarjeta. Sé empático y resolutivo."
            ),
        )

    def _profile(self, context: RunContextT):
        phone = normalize_phone(context.userdata.from_number or "")
        return get_demo_customer(phone)

    @function_tool
    async def lookup_customer(
        self,
        phone_number: Annotated[str, Field(description="Teléfono que el cliente acaba de proporcionar")],
        context: RunContextT,
    ) -> str:
        """Buscar al cliente en CRM solo después de que indique su teléfono."""
        ctx = context.userdata
        if not ctx.crm:
            return "No tengo acceso al CRM en este momento."
        phone = normalize_phone(phone_number)
        ctx.from_number = phone
        demo = get_demo_customer(phone)
        customer = await ctx.crm.get_or_create_customer(phone)
        ctx.customer_name = customer.name or (demo.name if demo else None)
        ctx.customer_email = customer.email
        ctx.customer_notes = customer.notes
        ctx.is_vip = customer.vip or (demo.vip if demo else False)
        if demo:
            from call_management.crm.banking_data import format_customer_lookup

            return format_customer_lookup(demo)
        if customer.name:
            return f"Encontré a {customer.name} con el teléfono {phone}."
        return f"Teléfono {phone} registrado sin nombre aún."

    @function_tool
    async def verify_bac_account(
        self,
        account_last_four: Annotated[str, Field(description="Últimos 4 dígitos de la cuenta BAC")],
        context: RunContextT,
    ) -> str:
        """Verifica los últimos 4 dígitos de la cuenta BAC del cliente."""
        profile = self._profile(context)
        if not profile:
            return "No encontré un perfil bancario para este número. Transfiere a recepción si es necesario."
        last4 = account_last_four.strip()[-4:]
        expected = profile.banking.account_number[-4:]
        if last4 == expected:
            ctx = context.userdata
            ctx.call_notes.append(f"BAC account verified (****{last4})")
            return (
                f"Cuenta verificada correctamente. Tipo: {profile.banking.account_type}. "
                f"Banco: {profile.banking.institution}."
            )
        return "Los últimos 4 dígitos no coinciden con nuestra cuenta registrada. Pide al cliente que verifique."

    @function_tool
    async def verify_debit_card(
        self,
        card_last_four: Annotated[str, Field(description="Últimos 4 dígitos de la tarjeta débito")],
        expiry: Annotated[str, Field(description="Vencimiento MM/AAAA o cadena vacía")],
        context: RunContextT,
    ) -> str:
        """Verifica los últimos 4 dígitos (y opcionalmente vencimiento) de la tarjeta débito."""
        profile = self._profile(context)
        if not profile:
            return "No hay tarjeta registrada para este número."
        last4 = card_last_four.strip()[-4:]
        if last4 != profile.banking.debit_card_last4:
            return "Los últimos 4 dígitos de la tarjeta no coinciden."
        if expiry.strip() and expiry.strip() != profile.banking.debit_card_exp:
            return "La tarjeta coincide parcialmente pero el vencimiento no es correcto."
        masked = profile.banking.debit_card_masked
        context.userdata.call_notes.append(f"Debit card verified (****{last4})")
        return f"Tarjeta débito verificada: {masked} (vence {profile.banking.debit_card_exp})."

    @function_tool
    async def block_debit_card_temporarily(
        self,
        reason: Annotated[str, Field(description="Motivo del bloqueo temporal")],
        context: RunContextT,
    ) -> str:
        """Bloquea temporalmente la tarjeta débito por fraude o pérdida."""
        profile = self._profile(context)
        if not profile:
            return "No se puede bloquear: cliente sin tarjeta registrada."
        note = f"[Bloqueo temporal débito] {reason}"
        if context.userdata.crm and context.userdata.from_number:
            await context.userdata.crm.add_customer_note(context.userdata.from_number, note)
        context.userdata.call_notes.append(note)
        last4 = profile.banking.debit_card_last4
        return (
            f"Tarjeta débito terminada en {last4} bloqueada temporalmente. "
            "El cliente puede solicitar reposición en sucursal."
        )

    @function_tool
    async def get_account_summary(self, context: RunContextT) -> str:
        """Resumen de productos bancarios del cliente (requiere lookup previo)."""
        profile = self._profile(context)
        if not profile:
            return "Primero usa lookup_customer para identificar al cliente."
        b = profile.banking
        parts = [
            f"{profile.name} — {b.institution}",
            f"Cuenta {b.account_type}: ****{b.account_number[-4:]}",
            f"Débito: {b.debit_card_masked}",
        ]
        if b.credit_card_masked:
            parts.append(f"Crédito: {b.credit_card_masked}")
        parts.append(f"Productos: {', '.join(b.products)}")
        return ". ".join(parts) + "."