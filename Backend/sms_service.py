"""
Universal dispatch service delegating to whatsapp_service.
Dispatches directly to WhatsApp for farmer's registered profile number.
"""
from whatsapp_service import (
    send_low_bandwidth_advisory_whatsapp as send_low_bandwidth_advisory_sms,
    normalize_phone_whatsapp as normalize_phone_10_digit,
    extract_advisory_excerpt,
)
