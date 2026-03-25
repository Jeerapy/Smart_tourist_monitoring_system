from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .geo import haversine_m, point_in_zone
from .models import LocationPingIn, SosIn, ZoneCreate, ZoneUpdate
from .security import AuthContext, AuthUser, get_auth_context, get_current_user, require_role
from .supabase_rest import SupabaseRest
from .verification import (
    extract_fields,
    extract_text_from_pdf_bytes,
    extract_text_from_image_bytes,
    verify_profile,
)


app = FastAPI(title="Smart Tourist Monitoring - Backend API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _now_utc() -> datetime:
    return datetime.now(tz=timezone.utc)


def _alert_defaults(alert_type: str, zone_risk_level: int | None = None) -> dict[str, Any]:
    if alert_type == "GEOFENCE":
        return {
            "summary": "User entered high-risk zone",
            "severity": max(2, int(zone_risk_level or 1)),
            "risk_level": int(zone_risk_level or 1),
            "source": "rule_engine",
        }
    if alert_type == "SOS":
        return {
            "summary": "Emergency SOS triggered",
            "severity": 5,
            "risk_level": 5,
            "source": "rule_engine",
        }
    return {"summary": "Alert triggered", "severity": 1, "risk_level": 1, "source": "rule_engine"}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/me")
async def me(user: AuthUser = Depends(get_current_user)) -> dict[str, Any]:
    return {"user_id": user.user_id, "role": user.role}


@app.get("/zones")
async def list_zones(ctx: AuthContext = Depends(get_auth_context)) -> list[dict[str, Any]]:
    sb = SupabaseRest()
    return await sb.list_zones(bearer_token=ctx.token)


@app.post("/zones")
async def create_zone(
    body: ZoneCreate,
    ctx: AuthContext = Depends(get_auth_context),
    _: AuthUser = Depends(require_role("authority")),
) -> dict[str, Any]:
    payload = body.model_dump()
    payload["created_by"] = ctx.user.user_id
    sb = SupabaseRest()
    return await sb.create_zone(bearer_token=ctx.token, payload=payload)


@app.put("/zones/{zone_id}")
async def update_zone(
    zone_id: str,
    body: ZoneUpdate,
    ctx: AuthContext = Depends(get_auth_context),
    _: AuthUser = Depends(require_role("authority")),
) -> dict[str, Any]:
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    sb = SupabaseRest()
    return await sb.update_zone(bearer_token=ctx.token, zone_id=zone_id, payload=payload)


@app.delete("/zones/{zone_id}")
async def delete_zone(
    zone_id: str,
    ctx: AuthContext = Depends(get_auth_context),
    _: AuthUser = Depends(require_role("authority")),
) -> dict[str, Any]:
    sb = SupabaseRest()
    await sb.delete_zone(bearer_token=ctx.token, zone_id=zone_id)
    return {"deleted": True, "zone_id": zone_id}


@app.post("/location/ping")
async def location_ping(
    body: LocationPingIn,
    ctx: AuthContext = Depends(get_auth_context),
    _: AuthUser = Depends(require_role("user")),
) -> dict[str, Any]:
    sb = SupabaseRest()

    ping_payload = body.model_dump()
    ping_payload["user_id"] = ctx.user.user_id
    ping_row = await sb.insert_ping(bearer_token=ctx.token, payload=ping_payload)

    # Update last-location cache (upsert)
    last_payload = {
        "user_id": ctx.user.user_id,
        "lat": body.lat,
        "lng": body.lng,
        "recorded_at": body.recorded_at.isoformat(),
        "accuracy_m": body.accuracy_m,
        "heading_deg": body.heading_deg,
        "altitude_m": body.altitude_m,
        "speed_mps": body.speed_mps,
        "updated_at": _now_utc().isoformat(),
    }
    await sb.upsert_last_location(bearer_token=ctx.token, payload=last_payload)

    # Geofence rule (circle default; polygon supported)
    zones = await sb.list_zones(bearer_token=ctx.token)
    hit_zone: dict[str, Any] | None = None

    # Circles first
    for z in zones:
        if z.get("shape_type") == "CIRCLE" and point_in_zone(body.lat, body.lng, z):
            hit_zone = z
            break
    if hit_zone is None:
        for z in zones:
            if z.get("shape_type") == "POLYGON" and point_in_zone(body.lat, body.lng, z):
                hit_zone = z
                break

    alert_row = None
    deduped = False
    if hit_zone is not None:
        dedup_after = (_now_utc() - timedelta(seconds=settings.alert_dedup_seconds)).isoformat()
        recent = await sb.find_recent_alerts(
            bearer_token=ctx.token,
            user_id=ctx.user.user_id,
            alert_type="GEOFENCE",
            created_after_iso=dedup_after,
        )
        if recent:
            deduped = True
        else:
            defaults = _alert_defaults("GEOFENCE", zone_risk_level=hit_zone.get("risk_level"))
            alert_payload = {
                "user_id": ctx.user.user_id,
                "type": "GEOFENCE",
                "status": "OPEN",
                "severity": defaults["severity"],
                "source": defaults["source"],
                "risk_level": defaults["risk_level"],
                "summary": defaults["summary"],
                "triggered_by_zone_id": hit_zone.get("id"),
                "trigger_lat": body.lat,
                "trigger_lng": body.lng,
            }
            alert_row = await sb.create_alert(bearer_token=ctx.token, payload=alert_payload)

    return {
        "ping": ping_row,
        "geofence": {
            "hit": hit_zone is not None,
            "zone": hit_zone,
            "alert_created": alert_row is not None,
            "deduped": deduped,
            "alert": alert_row,
        },
    }


@app.post("/alerts/sos")
async def sos(
    body: SosIn,
    ctx: AuthContext = Depends(get_auth_context),
    _: AuthUser = Depends(require_role("user")),
) -> dict[str, Any]:
    sb = SupabaseRest()

    dedup_after = (_now_utc() - timedelta(seconds=settings.alert_dedup_seconds)).isoformat()
    recent = await sb.find_recent_alerts(
        bearer_token=ctx.token,
        user_id=ctx.user.user_id,
        alert_type="SOS",
        created_after_iso=dedup_after,
    )
    if recent:
        return {"created": False, "deduped": True, "recent_alert_id": recent[0].get("id")}

    defaults = _alert_defaults("SOS")
    alert_payload = {
        "user_id": ctx.user.user_id,
        "type": "SOS",
        "status": "OPEN",
        "severity": defaults["severity"],
        "source": defaults["source"],
        "risk_level": defaults["risk_level"],
        "summary": body.summary or defaults["summary"],
        "trigger_lat": body.lat,
        "trigger_lng": body.lng,
    }
    alert = await sb.create_alert(bearer_token=ctx.token, payload=alert_payload)
    return {"created": True, "alert": alert}


@app.get("/me/alerts")
async def my_alerts(ctx: AuthContext = Depends(get_auth_context)) -> list[dict[str, Any]]:
    sb = SupabaseRest()
    return await sb.list_my_alerts(bearer_token=ctx.token)


@app.get("/authority/alerts/nearby")
async def authority_nearby_alerts(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_m: int | None = Query(None, ge=100),
    ctx: AuthContext = Depends(get_auth_context),
    _: AuthUser = Depends(require_role("authority")),
) -> dict[str, Any]:
    sb = SupabaseRest()
    radius = radius_m or settings.nearby_alerts_default_radius_m

    open_alerts = await sb.list_open_alerts(bearer_token=ctx.token)
    user_ids = list({a.get("user_id") for a in open_alerts if a.get("user_id")})
    last_locations = await sb.get_last_locations(bearer_token=ctx.token, user_ids=[str(u) for u in user_ids])
    last_by_user = {ll["user_id"]: ll for ll in last_locations if ll.get("user_id")}

    results: list[dict[str, Any]] = []
    for a in open_alerts:
        uid = a.get("user_id")
        ll = last_by_user.get(uid)
        if not ll:
            continue
        d = haversine_m(lat, lng, float(ll["lat"]), float(ll["lng"]))
        if d <= radius:
            results.append({**a, "user_last_location": ll, "distance_m": d})

    results.sort(key=lambda x: x.get("distance_m", 0))
    return {"radius_m": radius, "count": len(results), "alerts": results}


@app.post("/authority/alerts/{alert_id}/ack")
async def ack_alert(
    alert_id: str,
    ctx: AuthContext = Depends(get_auth_context),
    _: AuthUser = Depends(require_role("authority")),
) -> dict[str, Any]:
    sb = SupabaseRest()
    payload = {"status": "ACKED", "acked_by": ctx.user.user_id, "acked_at": _now_utc().isoformat()}
    alert = await sb.update_alert_status(bearer_token=ctx.token, alert_id=alert_id, payload=payload)
    return {"updated": True, "alert": alert}


@app.post("/authority/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    ctx: AuthContext = Depends(get_auth_context),
    _: AuthUser = Depends(require_role("authority")),
) -> dict[str, Any]:
    sb = SupabaseRest()
    payload = {"status": "RESOLVED", "resolved_by": ctx.user.user_id, "resolved_at": _now_utc().isoformat()}
    alert = await sb.update_alert_status(bearer_token=ctx.token, alert_id=alert_id, payload=payload)
    return {"updated": True, "alert": alert}


@app.get("/me/verification")
async def me_verification(ctx: AuthContext = Depends(get_auth_context)) -> dict[str, Any]:
    # Kept for when you want auth-based verification tied to Supabase.
    sb = SupabaseRest()
    profile = await sb.get_profile(user_id=ctx.user.user_id, bearer_token=ctx.token)
    latest = await sb.get_latest_user_document(bearer_token=ctx.token, user_id=ctx.user.user_id)
    return {
        "is_verified": bool(profile.get("is_verified")),
        "verified_at": profile.get("verified_at"),
        "latest_document": latest,
        "profile": profile,
    }


@app.get("/public/verification/info")
async def public_verification_info() -> dict[str, Any]:
    return {
        "mode": "public",
        "note": "This endpoint exists for simpler testing without auth. For Supabase-linked verification use /me/verification and /verification/upload-document with Authorization.",
        "scanned_pdf_ocr": "not_enabled",
    }


@app.post("/verification/upload-document")
async def upload_document_for_verification(
    file: UploadFile = File(...),
    doc_type: str = Form("OTHER"),
    # Public-mode inputs for simple testing (no Supabase needed)
    full_name: str | None = Form(None),
    dob: str | None = Form(None),  # YYYY-MM-DD
    ctx: AuthContext = Depends(get_auth_context),
    _: AuthUser = Depends(require_role("user")),
) -> dict[str, Any]:
    sb = SupabaseRest()
    profile = await sb.get_profile(user_id=ctx.user.user_id, bearer_token=ctx.token)

    raw = await file.read()
    mime = file.content_type or "application/octet-stream"
    ocr_text = ""

    if mime == "application/pdf" or (file.filename or "").lower().endswith(".pdf"):
        ocr_text = extract_text_from_pdf_bytes(raw)
        if len((ocr_text or "").strip()) < 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This PDF appears to be scanned/image-only. Scanned-PDF OCR is not enabled in this simple hosting setup yet. Upload an image (JPG/PNG) or a text-based PDF.",
            )
    else:
        ocr_text = extract_text_from_image_bytes(raw)

    extracted = extract_fields(ocr_text)
    verified, details = verify_profile(
        profile_full_name=profile.get("full_name"),
        profile_dob=profile.get("dob"),
        extracted=extracted,
    )

    doc_payload = {
        "user_id": ctx.user.user_id,
        "doc_type": doc_type,
        "file_name": file.filename,
        "mime_type": mime,
        "ocr_text": ocr_text or "",
        "extracted_name": extracted.name,
        "extracted_dob": extracted.dob.isoformat() if extracted.dob else None,
        "extraction_confidence": extracted.confidence,
        "verification_result": "MATCH" if verified else "NO_MATCH",
    }
    doc_row = await sb.insert_user_document(bearer_token=ctx.token, payload=doc_payload)

    profile_update = None
    if verified and not profile.get("is_verified"):
        profile_update = await sb.update_profile(
            bearer_token=ctx.token,
            user_id=ctx.user.user_id,
            payload={"is_verified": True, "verified_at": _now_utc().isoformat()},
        )

    return {
        "uploaded": True,
        "verified": verified,
        "verification_details": details,
        "document": doc_row,
        "profile_updated": profile_update,
    }


@app.post("/public/verification/upload-document")
async def public_upload_document_for_verification(
    file: UploadFile = File(...),
    doc_type: str = Form("OTHER"),
    full_name: str = Form(...),
    dob: str = Form(...),  # YYYY-MM-DD
) -> dict[str, Any]:
    raw = await file.read()
    mime = file.content_type or "application/octet-stream"

    if mime == "application/pdf" or (file.filename or "").lower().endswith(".pdf"):
        ocr_text = extract_text_from_pdf_bytes(raw)
        if len((ocr_text or "").strip()) < 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This PDF appears to be scanned/image-only. Scanned-PDF OCR is not enabled yet in simple mode. Upload an image (JPG/PNG) or a text-based PDF.",
            )
    else:
        ocr_text = extract_text_from_image_bytes(raw)

    extracted = extract_fields(ocr_text)
    verified, details = verify_profile(
        profile_full_name=full_name,
        profile_dob=dob,
        extracted=extracted,
    )

    return {
        "uploaded": True,
        "mode": "public",
        "doc_type": doc_type,
        "file_name": file.filename,
        "mime_type": mime,
        "ocr_text_preview": (ocr_text[:1200] + "…") if len(ocr_text) > 1200 else ocr_text,
        "extracted": {
            "name": extracted.name,
            "dob": extracted.dob.isoformat() if extracted.dob else None,
        },
        "verified": verified,
        "verification_details": details,
        "note": "No Supabase write in public mode.",
    }


