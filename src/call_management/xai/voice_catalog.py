"""xAI built-in voice library metadata for the admin UI."""

from __future__ import annotations

from typing import Any

# Per xAI Voice Agent docs — built-in voices with gender/tone; multilingual via auto-detect + language_hint
VOICE_LIBRARY: list[dict[str, Any]] = [
    {
        "id": "eve",
        "name": "Eve",
        "gender": "female",
        "age_group": "adult",
        "tone": "Energética, entusiasta",
        "description": "Voz por defecto xAI. Ideal para experiencias dinámicas.",
        "languages": ["en", "es-MX", "es-ES", "multi"],
    },
    {
        "id": "ara",
        "name": "Ara",
        "gender": "female",
        "age_group": "adult",
        "tone": "Cálida, amigable",
        "description": "Equilibrada y conversacional. Recomendada para recepción y soporte.",
        "languages": ["en", "es-MX", "es-ES", "multi"],
    },
    {
        "id": "rex",
        "name": "Rex",
        "gender": "male",
        "age_group": "adult",
        "tone": "Seguro, claro",
        "description": "Profesional y articulado. Ideal para ventas y negocios.",
        "languages": ["en", "es-MX", "es-ES", "multi"],
    },
    {
        "id": "sal",
        "name": "Sal",
        "gender": "neutral",
        "age_group": "adult",
        "tone": "Suave, versátil",
        "description": "Neutra y adaptable a distintos contextos.",
        "languages": ["en", "es-MX", "es-ES", "multi"],
    },
    {
        "id": "leo",
        "name": "Leo",
        "gender": "male",
        "age_group": "adult",
        "tone": "Autoritario, firme",
        "description": "Decisivo. Adecuado para técnico y escalación.",
        "languages": ["en", "es-MX", "es-ES", "multi"],
    },
]

VOICE_LANGUAGE_OPTIONS: list[dict[str, str]] = [
    {"code": "en", "label": "English"},
    {"code": "es-MX", "label": "Español (México)"},
    {"code": "es-ES", "label": "Español (España)"},
    {"code": "fr", "label": "Français"},
    {"code": "de", "label": "Deutsch"},
    {"code": "pt-BR", "label": "Português (Brasil)"},
    {"code": "ja", "label": "日本語"},
    {"code": "multi", "label": "Auto-detect / Multilingüe"},
]

GENDER_OPTIONS = ["female", "male", "neutral"]
AGE_GROUP_OPTIONS = ["adult"]


def filter_voice_library(
    *,
    gender: str | None = None,
    age_group: str | None = None,
    language: str | None = None,
) -> list[dict[str, Any]]:
    result = VOICE_LIBRARY
    if gender:
        result = [v for v in result if v["gender"] == gender]
    if age_group:
        result = [v for v in result if v["age_group"] == age_group]
    if language and language != "multi":
        result = [v for v in result if language in v["languages"] or "multi" in v["languages"]]
    return result