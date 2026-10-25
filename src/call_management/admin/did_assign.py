"""Choose which agent receives a DID in Guía inicio."""

from __future__ import annotations

import re
from typing import Any


def _digits(phone: str | None) -> str:
    return re.sub(r"\D", "", phone or "")


def choose_did_agent(agents: list[Any], phone: str) -> Any | None:
    """Return the agent that already owns `phone`.

    Guía inicio must attach the number it shows to that owner (Recepción US for
    the guide's DID), not to whichever agent happens to be first and active.
    """
    target = _digits(phone)
    if not target:
        return None
    for agent in agents:
        if isinstance(agent, dict):
            primary = agent.get("phone_number")
            extras = agent.get("phone_numbers") or []
        else:
            primary = getattr(agent, "phone_number", None)
            extras = getattr(agent, "phone_numbers", None) or []
        owned = [primary, *extras]
        if any(_digits(number) == target for number in owned if number):
            return agent
    return None
