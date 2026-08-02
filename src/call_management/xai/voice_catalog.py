"""xAI built-in voice library metadata for the admin UI.

Sources:
- https://docs.x.ai/developers/model-capabilities/audio/voice (full roster)
- https://x.ai/news/new-flagship-voices (21 new flagship voices + original five upgrade)
"""

from __future__ import annotations

from typing import Any

# Full supported languages for Speech-to-Speech / TTS (BCP-47).
# Spanish/Portuguese require regional variants for language_hint.
_ALL_LANGS = [
    "en",
    "es-MX",
    "es-ES",
    "pt-BR",
    "pt-PT",
    "fr",
    "de",
    "it",
    "ja",
    "ko",
    "zh",
    "hi",
    "ar-EG",
    "ar-SA",
    "ar-AE",
    "bn",
    "id",
    "ru",
    "tr",
    "vi",
    "multi",
]

# 26 built-in voices: 21 new flagship (Jul 2026) + original five (retrained for naturalness).
VOICE_LIBRARY: list[dict[str, Any]] = [
    # --- Original five (upgraded naturalness: pacing, phrasing, emphasis) ---
    {
        "id": "ara",
        "name": "Ara",
        "gender": "female",
        "age_group": "adult",
        "tone": "Warm and friendly",
        "description": "Original xAI voice, retrained. Ideal for recepción y soporte cálido.",
        "use_cases": ["Support", "Assistant"],
        "generation": "classic",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "eve",
        "name": "Eve",
        "gender": "female",
        "age_group": "adult",
        "tone": "Energetic and upbeat",
        "description": "Original xAI voice, retrained. Ideal para experiencias dinámicas.",
        "use_cases": ["Assistant", "Sales"],
        "generation": "classic",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "leo",
        "name": "Leo",
        "gender": "male",
        "age_group": "adult",
        "tone": "Authoritative and strong",
        "description": "Original xAI voice, retrained. Decisivo para técnico y escalación.",
        "use_cases": ["Support", "Assistant"],
        "generation": "classic",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "rex",
        "name": "Rex",
        "gender": "male",
        "age_group": "adult",
        "tone": "Confident and clear",
        "description": "Original xAI voice, retrained. Profesional para ventas y negocios.",
        "use_cases": ["Sales", "Advertising"],
        "generation": "classic",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "sal",
        "name": "Sal",
        "gender": "neutral",
        "age_group": "adult",
        "tone": "Smooth and balanced",
        "description": "Original xAI voice, retrained. Neutra y adaptable a distintos contextos.",
        "use_cases": ["Assistant", "Support"],
        "generation": "classic",
        "languages": list(_ALL_LANGS),
    },
    # --- 21 new flagship voices (Jul 2026) ---
    {
        "id": "carina",
        "name": "Carina",
        "gender": "female",
        "age_group": "adult",
        "tone": "Soft, empathetic, and soothing",
        "description": "Empática y calmada. Excelente para soporte y wellness.",
        "use_cases": ["Wellness", "Support"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "celeste",
        "name": "Celeste",
        "gender": "female",
        "age_group": "adult",
        "tone": "Compassionate, confident, and reassuring",
        "description": "Compasiva y segura. Ideal para soporte y asistentes de atención.",
        "use_cases": ["Support", "Assistant"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "castor",
        "name": "Castor",
        "gender": "male",
        "age_group": "adult",
        "tone": "Charismatic, down-to-earth, and easygoing",
        "description": "Carismático y cercano. Ideal para ventas y soporte comercial.",
        "use_cases": ["Sales", "Support"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "atlas",
        "name": "Atlas",
        "gender": "male",
        "age_group": "adult",
        "tone": "Confident, commanding, and reassuring",
        "description": "Seguro y confiable. Bueno para ventas y asistentes de negocio.",
        "use_cases": ["Sales", "Assistant"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "rigel",
        "name": "Rigel",
        "gender": "male",
        "age_group": "adult",
        "tone": "Precise, professional, and calmly confident",
        "description": "Preciso y profesional. Ideal para soporte técnico y asistentes.",
        "use_cases": ["Assistant", "Support"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "naksh",
        "name": "Naksh",
        "gender": "male",
        "age_group": "adult",
        "tone": "Warm, thoughtful, and wise",
        "description": "Cálido y reflexivo. Excelente para banking y soporte sensible.",
        "use_cases": ["Assistant", "Support"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "lux",
        "name": "Lux",
        "gender": "female",
        "age_group": "adult",
        "tone": "Grounded, calm, and quietly wise",
        "description": "Serena y equilibrada. Ideal para escalación y conversaciones delicadas.",
        "use_cases": ["Wellness", "Narration"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "iris",
        "name": "Iris",
        "gender": "female",
        "age_group": "adult",
        "tone": "Friendly, upbeat, and naturally charming",
        "description": "Amigable y encantadora. Buena para ventas y soporte ligero.",
        "use_cases": ["Sales", "Support"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "luna",
        "name": "Luna",
        "gender": "female",
        "age_group": "adult",
        "tone": "Gentle, patient, and deeply nurturing",
        "description": "Gentil y paciente. Ideal para educación y asistentes de onboarding.",
        "use_cases": ["Education", "Assistant"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "lumen",
        "name": "Lumen",
        "gender": "male",
        "age_group": "adult",
        "tone": "Warm, articulate, and engaging",
        "description": "Cálido y articulado. Ideal para educación y comunicación clara.",
        "use_cases": ["Education", "Advertising"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "helios",
        "name": "Helios",
        "gender": "male",
        "age_group": "adult",
        "tone": "Upbeat, energetic, and endlessly versatile",
        "description": "Energético y versátil. Buen asistente general y wellness.",
        "use_cases": ["Assistant", "Wellness"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "ursa",
        "name": "Ursa",
        "gender": "female",
        "age_group": "adult",
        "tone": "Friendly, warm, and steadfast",
        "description": "Cálida y constante. Ideal para asistentes de largo plazo.",
        "use_cases": ["Assistant", "Podcast"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "cosmo",
        "name": "Cosmo",
        "gender": "male",
        "age_group": "adult",
        "tone": "Bright, curious, and easy to follow",
        "description": "Claro y curioso. Ideal para educación y guías paso a paso.",
        "use_cases": ["Education", "Podcast"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "zenith",
        "name": "Zenith",
        "gender": "male",
        "age_group": "adult",
        "tone": "Sharp, focused, and driven",
        "description": "Enfocado y directo. Ideal para ventas de alto rendimiento.",
        "use_cases": ["Sales", "Advertising"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "altair",
        "name": "Altair",
        "gender": "female",
        "age_group": "adult",
        "tone": "Elegant, refined, and effortlessly premium",
        "description": "Elegante y premium. Ideal para marcas de alto nivel.",
        "use_cases": ["Advertising", "Narration"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "perseus",
        "name": "Perseus",
        "gender": "male",
        "age_group": "adult",
        "tone": "Strong, confident, and trustworthy",
        "description": "Fuerte y confiable. Ideal para publicidad y narración corporativa.",
        "use_cases": ["Advertising", "Narration"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "kepler",
        "name": "Kepler",
        "gender": "male",
        "age_group": "adult",
        "tone": "Inventive, forward-thinking, and charismatic",
        "description": "Innovador y carismático. Ideal para product demos y tech sales.",
        "use_cases": ["Advertising", "Podcast"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "orion",
        "name": "Orion",
        "gender": "male",
        "age_group": "adult",
        "tone": "Rich, cinematic, and resonant",
        "description": "Cinemático y profundo. Ideal para narración y audiolibros.",
        "use_cases": ["Narration", "Audiobooks"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "helix",
        "name": "Helix",
        "gender": "male",
        "age_group": "adult",
        "tone": "Bold, dynamic, and adrenaline-fueled",
        "description": "Dinámico y audaz. Ideal para commentary y podcasts energéticos.",
        "use_cases": ["Commentary", "Podcast"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "zagan",
        "name": "Zagan",
        "gender": "male",
        "age_group": "adult",
        "tone": "Powerful, dramatic, and unmistakable",
        "description": "Dramático e inconfundible. Ideal para personajes y narración intensa.",
        "use_cases": ["Characters", "Narration"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
    {
        "id": "sirius",
        "name": "Sirius",
        "gender": "male",
        "age_group": "adult",
        "tone": "Quick-witted, clever, and playful",
        "description": "Ágil e ingenioso. Ideal para commentary y personajes juguetones.",
        "use_cases": ["Commentary", "Characters"],
        "generation": "flagship",
        "languages": list(_ALL_LANGS),
    },
]

BUILTIN_VOICE_IDS: tuple[str, ...] = tuple(v["id"] for v in VOICE_LIBRARY)

VOICE_LANGUAGE_OPTIONS: list[dict[str, str]] = [
    {"code": "en", "label": "English"},
    {"code": "es-MX", "label": "Español (México)"},
    {"code": "es-ES", "label": "Español (España)"},
    {"code": "pt-BR", "label": "Português (Brasil)"},
    {"code": "pt-PT", "label": "Português (Portugal)"},
    {"code": "fr", "label": "Français"},
    {"code": "de", "label": "Deutsch"},
    {"code": "it", "label": "Italiano"},
    {"code": "ja", "label": "日本語"},
    {"code": "ko", "label": "한국어"},
    {"code": "zh", "label": "中文 (简体)"},
    {"code": "hi", "label": "हिन्दी"},
    {"code": "ar-EG", "label": "العربية (مصر)"},
    {"code": "ar-SA", "label": "العربية (السعودية)"},
    {"code": "ar-AE", "label": "العربية (الإمارات)"},
    {"code": "bn", "label": "বাংলা"},
    {"code": "id", "label": "Bahasa Indonesia"},
    {"code": "ru", "label": "Русский"},
    {"code": "tr", "label": "Türkçe"},
    {"code": "vi", "label": "Tiếng Việt"},
    {"code": "multi", "label": "Auto-detect / Multilingüe"},
]

GENDER_OPTIONS = ["female", "male", "neutral"]
AGE_GROUP_OPTIONS = ["adult"]


def filter_voice_library(
    *,
    gender: str | None = None,
    age_group: str | None = None,
    language: str | None = None,
    use_case: str | None = None,
    generation: str | None = None,
) -> list[dict[str, Any]]:
    result = VOICE_LIBRARY
    if gender:
        result = [v for v in result if v["gender"] == gender]
    if age_group:
        result = [v for v in result if v["age_group"] == age_group]
    if language and language != "multi":
        result = [v for v in result if language in v["languages"] or "multi" in v["languages"]]
    if use_case:
        needle = use_case.lower()
        result = [
            v
            for v in result
            if any(needle == uc.lower() or needle in uc.lower() for uc in v.get("use_cases", []))
        ]
    if generation:
        result = [v for v in result if v.get("generation") == generation]
    return result
