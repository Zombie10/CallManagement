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
    html = html_path.read_text(encoding="utf-8")
    html_l = html.lower()
    assert html_path.is_file()
    assert "type=\"module\"" not in html_l
    assert "propuesta_charts.js" in html
    assert "propuesta ejecutiva" in html_l
    assert "callcenter bancario" in html_l
    assert "grok voice" in html_l
    assert "banking_support" in html_l
    assert "lookup_customer" in html_l
    assert "sip" in html_l
    assert "crm" in html_l
    assert "grabación" in html_l or "grabacion" in html_l
    assert "reducción de costos" in html_l or "reduccion de costos" in html_l
    assert "beneficios" in html_l
    assert "mejoras" in html_l
    assert 'id="prev"' in html
    assert 'id="next"' in html
    assert 'id="dots"' in html
    assert "xxxx" not in html_l
    assert "lorem ipsum" not in html_l


def test_html_charts_and_deck_controller_from_shipped_js():
    import json
    import subprocess

    runner = REPO / "tests" / "run_propuesta_html.js"
    proc = subprocess.run(
        ["node", str(runner)],
        cwd=str(REPO),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr or proc.stdout
    data = json.loads(proc.stdout)
    assert data["minuteN"] == 4
    assert data["mixN"] == 4
    assert data["minuteVals"] == [28, 22, 18, 32]
    assert data["mixVals"] == [58, 24, 12, 6]
    assert data["uniqueMinuteD"] == 4
    assert data["uniqueMixD"] == 4
    assert data["minuteHasArc"] is True
    assert data["mixHasArc"] is True
    assert "Espera / IVR" in data["minuteLabels"]
    assert "Voz primer nivel" in data["mixLabels"]
    assert data["barValues"] == [100, 82, 58, 45]
    assert data["barWidths"][0] == 100
    assert data["barWidths"][-1] < data["barWidths"][0]
    assert data["deck0"] == 0
    assert data["deck1"] == 1
    assert data["deckWrap"] == 0
    assert data["onAfterMount"] == 1
    assert data["onAfterNext"] == [1]
