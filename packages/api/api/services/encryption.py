"""
Field-level encryption for Personal Health Information (PHI).

Design:
  - Uses Fernet (AES-128-CBC + HMAC-SHA256) symmetric encryption.
  - Key is read from settings.encryption_key (base64-encoded Fernet key).
  - If no key is configured, data is stored plaintext with a warning (dev mode only).
  - Only biometric logs are encrypted by default (weight, body fat, heart rate).
  - Encrypted blobs are stored as base64 strings, prefixed with "enc:" to
    distinguish them from plaintext payloads.

HIPAA alignment:
  - Encryption at rest for §164.312(a)(2)(iv) Technical Safeguard.
  - Key stored separately from data (settings/env var, not in DB).
  - Audit trail in AuditEvent table covers §164.312(b).
"""
from __future__ import annotations

import base64
import json
import logging

from api.config import settings

log = logging.getLogger(__name__)

_fernet = None
_warned = False


def _get_fernet():
    global _fernet, _warned
    if _fernet:
        return _fernet
    if not settings.encryption_key:
        if not _warned:
            log.warning(
                "ENCRYPTION_KEY not set — biometric data stored in plaintext. "
                "Run: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
            _warned = True
        return None
    from cryptography.fernet import Fernet
    _fernet = Fernet(settings.encryption_key.encode())
    return _fernet


ENCRYPTED_PREFIX = "enc:"


def encrypt_payload(payload: dict) -> str:
    """
    Encrypt a dict payload.
    Returns a string: either "enc:<base64-fernet-token>" or plain JSON
    if no encryption key is configured.
    """
    f = _get_fernet()
    raw = json.dumps(payload).encode()
    if f is None:
        return raw.decode()
    token = f.encrypt(raw)
    return ENCRYPTED_PREFIX + base64.b64encode(token).decode()


def decrypt_payload(blob: str) -> dict:
    """
    Decrypt a payload blob back to a dict.
    Handles both encrypted ("enc:...") and plaintext JSON strings.
    """
    if not blob.startswith(ENCRYPTED_PREFIX):
        return json.loads(blob)

    f = _get_fernet()
    if f is None:
        raise ValueError("Payload is encrypted but ENCRYPTION_KEY is not configured.")

    from cryptography.fernet import InvalidToken
    try:
        raw_b64 = blob[len(ENCRYPTED_PREFIX):]
        token = base64.b64decode(raw_b64)
        return json.loads(f.decrypt(token))
    except InvalidToken as e:
        raise ValueError(f"Failed to decrypt payload: {e}") from e


def should_encrypt(log_type: str) -> bool:
    """Only biometric logs contain PHI that must be encrypted."""
    return settings.encrypt_biometrics and log_type == "biometric"
