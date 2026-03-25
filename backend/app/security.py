from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

import httpx
from fastapi import Depends, HTTPException, Request, status
from jose import jwt

from .config import settings
from .supabase_rest import SupabaseRest


Role = Literal["user", "authority"]


@dataclass(frozen=True)
class AuthUser:
    user_id: str
    role: Role
    raw_claims: dict[str, Any]

@dataclass(frozen=True)
class AuthContext:
    token: str
    user: AuthUser


@lru_cache(maxsize=1)
def _jwks_url() -> str:
    return f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


@lru_cache(maxsize=1)
def _issuer() -> str:
    return f"{settings.supabase_url.rstrip('/')}/auth/v1"


@lru_cache(maxsize=1)
def _jwks() -> dict[str, Any]:
    # Cache JWKS for process lifetime (good enough for MVP).
    with httpx.Client(timeout=10) as client:
        r = client.get(_jwks_url())
        r.raise_for_status()
        return r.json()


def get_bearer_token(request: Request) -> str:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")
    return auth.split(" ", 1)[1].strip()


async def get_auth_context(request: Request) -> AuthContext:
    token = get_bearer_token(request)
    try:
        claims = jwt.decode(
            token,
            _jwks(),
            algorithms=["RS256"],
            audience=settings.supabase_jwt_aud,
            issuer=_issuer(),
            options={"verify_at_hash": False},
        )
    except Exception as e:  # noqa: BLE001 - return as 401 for MVP
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from e

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token: missing sub")

    # Load role from profiles via PostgREST using the user's JWT (RLS enforced).
    sb = SupabaseRest()
    profile = await sb.get_profile(user_id=user_id, bearer_token=token)
    role = profile.get("role")
    if role not in ("user", "authority"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Profile role not set")

    user = AuthUser(user_id=user_id, role=role, raw_claims=claims)
    return AuthContext(token=token, user=user)


async def get_current_user(ctx: AuthContext = Depends(get_auth_context)) -> AuthUser:
    return ctx.user


def require_role(*roles: Role):
    async def _guard(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user

    return _guard

