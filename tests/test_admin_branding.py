"""Login mark, sidebar wordmark, and favicon share one Call Management identity."""

from __future__ import annotations

import re
from pathlib import Path
from xml.etree import ElementTree as ET

REPO = Path(__file__).resolve().parents[1]
LOGIN = REPO / "admin-ui" / "src" / "pages" / "Login.tsx"
LOGO = REPO / "admin-ui" / "src" / "components" / "AppLogo.tsx"
FAVICON = REPO / "admin-ui" / "public" / "favicon.svg"

OLD_BELL_MARK = "M20 6.5c-5.2"
OLD_BELL_FAVICON = "M32 14c-7.2"


def test_login_and_chrome_use_shared_non_bell_mark():
    login = LOGIN.read_text(encoding="utf-8")
    logo = LOGO.read_text(encoding="utf-8")
    favicon = FAVICON.read_text(encoding="utf-8")

    assert 'from "../components/AppLogo"' in login
    assert "AppLogoMark" in login
    assert "<AppLogoMark" in login
    assert "export function AppLogoMark" in logo
    assert "<AppLogoMark" in logo

    assert OLD_BELL_MARK not in logo
    assert OLD_BELL_FAVICON not in favicon
    assert OLD_BELL_MARK not in favicon
    assert OLD_BELL_FAVICON not in logo

    root = ET.fromstring(favicon)
    tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag
    assert tag == "svg"

    orbit = re.search(r'd="(M[^"]+A12[^"]+)"', logo)
    assert orbit, "AppLogoMark must ship an orbit path"
    assert orbit.group(1) in favicon, "favicon must use the same orbit as AppLogoMark"
