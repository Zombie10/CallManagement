"""CRM and customer data layer."""

from call_management.crm.database import CRMDatabase, get_crm
from call_management.crm.models import Appointment, CallRecord, Customer

__all__ = ["CRMDatabase", "get_crm", "Customer", "CallRecord", "Appointment"]
