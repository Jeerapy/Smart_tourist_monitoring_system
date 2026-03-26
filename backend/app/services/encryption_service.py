from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ..config import settings


@dataclass(frozen=True)
class EncryptedPayload:
    payload_bytes: bytes
    alg: str
    nonce_b64: str


def _load_key() -> bytes:
    key_b64 = (settings.document_encryption_key_b64 or "").strip()
    if key_b64:
        key = base64.b64decode(key_b64)
        if len(key) != 32:
            raise ValueError("DOCUMENT_ENCRYPTION_KEY_B64 must decode to 32 bytes")
        return key
    # Dev fallback: deterministic local-only key. Override in production.
    return b"\x00" * 32


def encrypt_document(raw: bytes, file_name: str | None, mime_type: str | None) -> EncryptedPayload:
    key = _load_key()
    aes = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aes.encrypt(nonce, raw, None)
    nonce_b64 = base64.b64encode(nonce).decode("utf-8")
    cipher_b64 = base64.b64encode(ciphertext).decode("utf-8")
    payload: dict[str, Any] = {
        "alg": "AES-256-GCM",
        "nonce_b64": nonce_b64,
        "ciphertext_b64": cipher_b64,
        "file_name": file_name,
        "mime_type": mime_type,
    }
    return EncryptedPayload(payload_bytes=json.dumps(payload).encode("utf-8"), alg="AES-256-GCM", nonce_b64=nonce_b64)


def decrypt_document_payload(payload_bytes: bytes) -> tuple[bytes, str | None, str | None]:
    key = _load_key()
    payload = json.loads(payload_bytes.decode("utf-8"))
    nonce = base64.b64decode(payload["nonce_b64"])
    ciphertext = base64.b64decode(payload["ciphertext_b64"])
    aes = AESGCM(key)
    raw = aes.decrypt(nonce, ciphertext, None)
    return raw, payload.get("file_name"), payload.get("mime_type")

