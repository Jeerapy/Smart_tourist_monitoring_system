from __future__ import annotations

import json
from typing import Any, Optional

import httpx

from .config import settings


class SupabaseRest:
    """
    Minimal PostgREST client for Supabase.
    Uses caller JWT for RLS enforcement.
    """

    def __init__(self) -> None:
        self._base = settings.supabase_url.rstrip("/")
        self._rest = f"{self._base}/rest/v1"

    def _headers(self, bearer_token: str) -> dict[str, str]:
        return {
            "apikey": settings.supabase_anon_key,
            "authorization": f"Bearer {bearer_token}",
            "content-type": "application/json",
        }

    async def _get(self, path: str, bearer_token: str, params: Optional[dict[str, str]] = None) -> Any:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{self._rest}/{path.lstrip('/')}",
                headers=self._headers(bearer_token),
                params=params or {},
            )
            r.raise_for_status()
            return r.json()

    async def _post(
        self,
        path: str,
        bearer_token: str,
        payload: Any,
        prefer: str = "return=representation",
    ) -> Any:
        headers = self._headers(bearer_token)
        headers["prefer"] = prefer
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{self._rest}/{path.lstrip('/')}",
                headers=headers,
                content=json.dumps(payload),
            )
            r.raise_for_status()
            return r.json() if r.text else None

    async def _patch(
        self,
        path: str,
        bearer_token: str,
        payload: Any,
        params: Optional[dict[str, str]] = None,
        prefer: str = "return=representation",
    ) -> Any:
        headers = self._headers(bearer_token)
        headers["prefer"] = prefer
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.patch(
                f"{self._rest}/{path.lstrip('/')}",
                headers=headers,
                params=params or {},
                content=json.dumps(payload),
            )
            r.raise_for_status()
            return r.json() if r.text else None

    async def _delete(
        self,
        path: str,
        bearer_token: str,
        params: Optional[dict[str, str]] = None,
    ) -> Any:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.delete(
                f"{self._rest}/{path.lstrip('/')}",
                headers=self._headers(bearer_token),
                params=params or {},
            )
            r.raise_for_status()
            return r.json() if r.text else None

    async def get_profile(self, user_id: str, bearer_token: str) -> dict[str, Any]:
        rows = await self._get(
            "profiles",
            bearer_token=bearer_token,
            params={"select": "id,role,full_name,dob,place,is_verified,verified_at", "id": f"eq.{user_id}"},
        )
        if not rows:
            return {}
        return rows[0]

    async def update_profile(self, bearer_token: str, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        rows = await self._patch(
            "profiles",
            bearer_token=bearer_token,
            payload=payload,
            params={"id": f"eq.{user_id}"},
        )
        return rows[0]

    async def list_zones(self, bearer_token: str) -> list[dict[str, Any]]:
        return await self._get(
            "danger_zones",
            bearer_token=bearer_token,
            params={"select": "*", "order": "created_at.desc"},
        )

    async def create_zone(self, bearer_token: str, payload: dict[str, Any]) -> dict[str, Any]:
        rows = await self._post("danger_zones", bearer_token=bearer_token, payload=payload)
        return rows[0]

    async def update_zone(self, bearer_token: str, zone_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        rows = await self._patch(
            "danger_zones",
            bearer_token=bearer_token,
            payload=payload,
            params={"id": f"eq.{zone_id}"},
        )
        return rows[0]

    async def delete_zone(self, bearer_token: str, zone_id: str) -> None:
        await self._delete("danger_zones", bearer_token=bearer_token, params={"id": f"eq.{zone_id}"})

    async def insert_ping(self, bearer_token: str, payload: dict[str, Any]) -> dict[str, Any]:
        rows = await self._post("user_location_pings", bearer_token=bearer_token, payload=payload)
        return rows[0]

    async def upsert_last_location(self, bearer_token: str, payload: dict[str, Any]) -> dict[str, Any]:
        # Upsert via PK user_id
        rows = await self._post(
            "user_last_location",
            bearer_token=bearer_token,
            payload=payload,
            prefer="resolution=merge-duplicates,return=representation",
        )
        return rows[0]

    async def create_alert(self, bearer_token: str, payload: dict[str, Any]) -> dict[str, Any]:
        rows = await self._post("alerts", bearer_token=bearer_token, payload=payload)
        return rows[0]

    async def list_my_alerts(self, bearer_token: str) -> list[dict[str, Any]]:
        return await self._get(
            "alerts",
            bearer_token=bearer_token,
            params={"select": "*", "order": "created_at.desc"},
        )

    async def find_recent_alerts(
        self,
        bearer_token: str,
        user_id: str,
        alert_type: str,
        created_after_iso: str,
    ) -> list[dict[str, Any]]:
        return await self._get(
            "alerts",
            bearer_token=bearer_token,
            params={
                "select": "id,type,status,created_at",
                "user_id": f"eq.{user_id}",
                "type": f"eq.{alert_type}",
                "created_at": f"gte.{created_after_iso}",
                "order": "created_at.desc",
            },
        )

    async def list_open_alerts(self, bearer_token: str) -> list[dict[str, Any]]:
        return await self._get(
            "alerts",
            bearer_token=bearer_token,
            params={"select": "*", "status": "eq.OPEN", "order": "created_at.desc"},
        )

    async def update_alert_status(
        self,
        bearer_token: str,
        alert_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        rows = await self._patch(
            "alerts",
            bearer_token=bearer_token,
            payload=payload,
            params={"id": f"eq.{alert_id}"},
        )
        return rows[0]

    async def get_last_locations(self, bearer_token: str, user_ids: list[str]) -> list[dict[str, Any]]:
        if not user_ids:
            return []
        # PostgREST "in" filter: in.(a,b,c)
        in_list = ",".join(user_ids)
        return await self._get(
            "user_last_location",
            bearer_token=bearer_token,
            params={"select": "*", "user_id": f"in.({in_list})"},
        )

    async def insert_user_document(self, bearer_token: str, payload: dict[str, Any]) -> dict[str, Any]:
        rows = await self._post("user_documents", bearer_token=bearer_token, payload=payload)
        return rows[0]

    async def get_latest_user_document(self, bearer_token: str, user_id: str) -> dict[str, Any] | None:
        rows = await self._get(
            "user_documents",
            bearer_token=bearer_token,
            params={"select": "*", "user_id": f"eq.{user_id}", "order": "created_at.desc", "limit": "1"},
        )
        return rows[0] if rows else None

