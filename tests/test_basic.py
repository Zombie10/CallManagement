"""Basic smoke tests for the Call Management package."""

import pytest
from call_management import __version__
from call_management.config import get_model_config
from call_management.crm.database import CRMDatabase, Customer


def test_version():
    assert __version__ == "0.1.0"


def test_model_config_defaults():
    cfg = get_model_config()
    assert cfg.backend in ("inference", "direct")
    assert "gpt" in cfg.llm_model or "gpt" in cfg.llm_model.lower()


@pytest.mark.asyncio
async def test_crm_basic(tmp_path):
    db = CRMDatabase(db_path=tmp_path / "test_crm.db")
    await db.initialize()

    cust = await db.get_or_create_customer("+15551234567")
    assert cust.phone_number == "+15551234567"

    cust.name = "Test User"
    await db.update_customer(cust)

    cust2 = await db.get_or_create_customer("+15551234567")
    assert cust2.name == "Test User"
