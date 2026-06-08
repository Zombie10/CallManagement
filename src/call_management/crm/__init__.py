"""CRM and customer data layer."""

from call_management.crm.database import Appointment, CallRecord, CRMDatabase, Customer, get_crm

__all__ = ["CRMDatabase", "get_crm", "Customer", "CallRecord", "Appointment"]
