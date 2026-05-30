from __future__ import annotations

from typing import Any

import httpx

from ..config import settings


class IpfsService:
    async def upload_bytes(
        self,
        payload: bytes,
        file_name: str = "encrypted-document.json",
    ) -> dict[str, Any]:
        if not settings.pinata_api_key or not settings.pinata_api_secret:
            raise RuntimeError("Pinata API credentials are not configured")
        headers = {
            "pinata_api_key": settings.pinata_api_key,
            "pinata_secret_api_key": settings.pinata_api_secret,
        }
        files = {"file": (file_name, payload, "application/json")}
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://api.pinata.cloud/pinning/pinFileToIPFS",
                headers=headers,
                files=files,
            )
            res.raise_for_status()
            data = res.json()
        cid = data.get("IpfsHash")
        if not cid:
            raise RuntimeError("Pinata upload succeeded but no CID was returned")
        uri = f"ipfs://{cid}"
        return {"cid": cid, "uri": uri, "provider": "pinata", "raw": data}

    async def fetch_bytes(self, cid: str) -> bytes:
        base = settings.pinata_gateway_base.rstrip("/")
        url = f"{base}/{cid}"
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.get(url)
            res.raise_for_status()
            return res.content

