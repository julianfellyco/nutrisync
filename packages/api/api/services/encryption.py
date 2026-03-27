"""
Field-level encryption for Personal Health Information (PHI).

Design:
  - Uses Fernet (AES-128-CBC + HMAC-SHA256) symmetric encryption.
  - Key rotation: ENCRYPTION_KEY accepts a comma-separated list of Fernet keys.
    The FIRST key is used for new encryptions; ALL keys are tried for decryption.
    To rotate: prepend the new key and keep the old one — old data is decryptable
    until you re-encrypt it with the new key.
  - If no key is configured, data is stored plaintext with a warning (dev mode only).
  - Only biometric logs are encrypted by default (weight, body fat, heart rate).
  - Encrypted blobs are stored as base64 strings, prefixed with "enc:" to
    distinguish them from plaintext payloads.

Key rotation workflow:
  1. Generate a new key:
     python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  2. Prepend it to ENCRYPTION_KEY (comma-separated): NEW_KEY,OLD_KEY
  3. Deploy — new data is encrypted with NEW_KEY; old data still decrypts via OLD_KEY.
  4. (Optional) Run a migration script to re-encrypt old records with NEW_KEY, then remove OLD_KEY.

HIPAA alignment:
  - Encryption at rest for §164.312(a)(2)(iv) Technical Safeguard.
  - Key stored separately from data (env var, not in DB).
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
    """
    Return a MultiFernet if keys are configured, None otherwise.
    MultiFernet tries the first key for encryption and all keys for decryption.
    """
    global _fernet, _warned
    if _fernet is not None:
        return _fernet
    if not settings.encryption_key:
        if not _warned:
            log.warning(
                "ENCRYPTION_KEY not set — biometric data stored in plaintext. "
                "Run: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
            _warned = True
        return None

    from cryptography.fernet import Fernet, MultiFernet

    raw_keys = [k.strip() for k in settings.encryption_key.split(",") if k.strip()]
    if len(raw_keys) == 1:
        _fernet = Fernet(raw_keys[0].encode())
    else:
        # MultiFernet: first key encrypts, all keys can decrypt (enables key rotation)
        _fernet = MultiFernet([Fernet(k.encode()) for k in raw_keys])

    return _fernet


ENCRYPTED_PREFIX = "enc:"


def encrypt_payload(payload: dict) -> str:
    """
    Encrypt a dict payload.
    Returns "enc:<base64-fernet-token>" or plain JSON if no key is configured.
    """
    f = _get_fernet()
    raw = json.dumps(payload).encode()
    if f is None:
        return raw.decode()
    token = f.encrypt(raw)
    return ENCRYPTED_PREFIX + base64.b64encode(token).decode()


def decrypt_payload(blob: str) -> dict:
    """
    Decrypt a payload blob. Handles both "enc:..." and plaintext JSON.
    With MultiFernet, all configured keys are tried automatically.
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
        raise ValueError(f"Failed to decrypt payload — check ENCRYPTION_KEY: {e}") from e


def should_encrypt(log_type: str) -> bool:
    """Only biometric logs contain PHI that must be encrypted."""
    return settings.encrypt_biometrics and log_type == "biometric"
