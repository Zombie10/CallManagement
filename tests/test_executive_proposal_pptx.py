"""The executive banking call-center proposal is a real PPTX in the repo."""

from __future__ import annotations

import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

REPO = Path(__file__).resolve().parents[1]
PPTX = REPO / "docs" / "Propuesta_Callcenter_Bancario.pptx"
NS = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}


def _slide_text(z: zipfile.ZipFile) -> str:
    parts: list[str] = []
    names = sorted(n for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml"))
    for name in names:
        root = ET.fromstring(z.read(name))
        for node in root.findall(".//a:t", NS):
            if node.text:
                parts.append(node.text)
    return "\n".join(parts)


def test_executive_proposal_pptx_is_spanish_banking_brief():
    assert PPTX.is_file(), f"missing {PPTX}"
    with zipfile.ZipFile(PPTX) as z:
        names = z.namelist()
        assert "[Content_Types].xml" in names
        slides = [n for n in names if n.startswith("ppt/slides/slide") and n.endswith(".xml")]
        assert len(slides) >= 8
        charts = [n for n in names if n.startswith("ppt/charts/") and n.endswith(".xml")]
        assert charts, "expected at least one native Office chart part"
        media = [n for n in names if n.startswith("ppt/media/")]
        assert media, "expected slide icons/media"
        types = z.read("[Content_Types].xml").decode("utf-8", errors="replace")
        assert "presentationml.slide+xml" in types
        text = _slide_text(z).lower()

    assert "propuesta" in text
    assert "callcenter bancario" in text
    assert "grok voice" in text
    assert "banking_support" in text
    assert "sip" in text
    assert "crm" in text
    assert "grabación" in text or "grabacion" in text
    assert "lookup_customer" in text
    assert "reducción de costos" in text or "reduccion de costos" in text
    assert "beneficios" in text
    assert "mejoras" in text
    assert "ilustrativo" in text
    assert "xxxx" not in text
    assert "lorem ipsum" not in text
    assert "click to add" not in text


def test_executive_proposal_html_has_glass_controls_and_charts():
    html_path = REPO / "docs" / "propuesta_callcenter_bancario.html"
    html = html_path.read_text(encoding="utf-8").lower()
    assert html_path.is_file()
    assert "propuesta ejecutiva" in html
    assert "callcenter bancario" in html
    assert "grok voice" in html
    assert "banking_support" in html
    assert "lookup_customer" in html
    assert "reducción de costos" in html or "reduccion de costos" in html
    assert "beneficios" in html
    assert "backdrop-filter" in html
    assert 'id="prev"' in html
    assert 'id="next"' in html
    assert 'id="dots"' in html
    assert "<svg" in html or "donut" in html
    assert "xxxx" not in html
    assert "lorem ipsum" not in html
