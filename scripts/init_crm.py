"""One-time helper to initialize the CRM database."""

import asyncio

from call_management.crm.database import get_crm


async def main():
    crm = await get_crm()
    print(f"CRM database initialized at {crm.db_path}")
    print("You can now run the agent.")


if __name__ == "__main__":
    asyncio.run(main())
