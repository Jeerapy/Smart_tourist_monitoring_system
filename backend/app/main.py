from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import io
from typing import Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import settings
from .geo import haversine_m, point_in_zone
from .models import LocationPingIn, SosIn, ZoneCreate, ZoneUpdate
from .services.blockchain_service import BlockchainService
from .services.digital_id_service import make_digital_id
from .services.encryption_service import decrypt_document_payload, encrypt_document
from .services.ipfs_service import IpfsService
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


def _validate_runtime_config() -> None:
    # Fail-fast only for inconsistent partial blockchain config.
    chain_fields = [
        settings.blockchain_rpc_url,
        settings.blockchain_private_key,
        settings.blockchain_account_address,
        settings.blockchain_contract_address,
        settings.blockchain_contract_abi_path,
    ]
    configured = [bool(x) for x in chain_fields]
    if any(configured) and not all(configured):
        raise RuntimeError(
            "Partial blockchain config detected. Set all blockchain env vars or leave all empty to disable."
        )


@app.on_event("startup")
async def on_startup() -> None:
    _validate_runtime_config()


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

        # Prefer last known location; fall back to alert trigger lat/lng (e.g. SOS).
        src_lat: float | None = None
        src_lng: float | None = None
        if ll and ll.get("lat") is not None and ll.get("lng") is not None:
            src_lat = float(ll["lat"])
            src_lng = float(ll["lng"])
        elif a.get("trigger_lat") is not None and a.get("trigger_lng") is not None:
            src_lat = float(a["trigger_lat"])
            src_lng = float(a["trigger_lng"])

        if src_lat is None or src_lng is None:
            continue

        d = haversine_m(lat, lng, src_lat, src_lng)
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


@app.get("/me/documents")
async def me_documents(ctx: AuthContext = Depends(get_auth_context)) -> dict[str, Any]:
    sb = SupabaseRest()
    docs = await sb.list_my_documents(bearer_token=ctx.token, user_id=ctx.user.user_id)
    did = await sb.get_digital_id_registry(bearer_token=ctx.token, user_id=ctx.user.user_id)
    return {"count": len(docs), "documents": docs, "digital_id": did}


@app.get("/me/documents/{doc_id}/view")
async def me_document_view(doc_id: str, ctx: AuthContext = Depends(get_auth_context)) -> StreamingResponse:
    sb = SupabaseRest()
    doc = await sb.get_my_document_by_id(bearer_token=ctx.token, user_id=ctx.user.user_id, document_id=doc_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    cid = doc.get("ipfs_cid")
    if not cid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Document is not stored on IPFS")

    ipfs = IpfsService()
    payload_bytes = await ipfs.fetch_bytes(cid=cid)
    raw, original_name, original_mime = decrypt_document_payload(payload_bytes=payload_bytes)
    mime = original_mime or doc.get("mime_type") or "application/octet-stream"
    file_name = original_name or doc.get("file_name") or "document"
    await sb.insert_document_access_log(
        bearer_token=ctx.token,
        payload={
            "document_id": doc.get("id"),
            "user_id": doc.get("user_id"),
            "viewer_id": ctx.user.user_id,
            "viewer_role": ctx.user.role,
            "reason": "self_view",
        },
    )
    return StreamingResponse(
        io.BytesIO(raw),
        media_type=mime,
        headers={"Content-Disposition": f'inline; filename="{file_name}"'},
    )


@app.get("/authority/users/{user_id}/documents/latest")
async def authority_latest_user_document(
    user_id: str,
    ctx: AuthContext = Depends(get_auth_context),
    _: AuthUser = Depends(require_role("authority")),
) -> dict[str, Any]:
    sb = SupabaseRest()
    open_alerts = await sb.list_open_alerts(bearer_token=ctx.token)
    if not any(a.get("user_id") == user_id for a in open_alerts):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authority access requires an active alert context for this user",
        )
    doc = await sb.get_latest_user_document(bearer_token=ctx.token, user_id=user_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No document found for user")
    return {"document": doc}


@app.get("/authority/documents/{doc_id}/view")
async def authority_document_view(
    doc_id: str,
    ctx: AuthContext = Depends(get_auth_context),
    _: AuthUser = Depends(require_role("authority")),
) -> StreamingResponse:
    sb = SupabaseRest()
    doc = await sb.get_document_by_id(bearer_token=ctx.token, document_id=doc_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    user_id = doc.get("user_id")
    open_alerts = await sb.list_open_alerts(bearer_token=ctx.token)
    if not any(a.get("user_id") == user_id for a in open_alerts):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authority access requires an active alert context for this user",
        )

    cid = doc.get("ipfs_cid")
    if not cid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Document is not stored on IPFS")
    ipfs = IpfsService()
    payload_bytes = await ipfs.fetch_bytes(cid=cid)
    raw, original_name, original_mime = decrypt_document_payload(payload_bytes=payload_bytes)
    mime = original_mime or doc.get("mime_type") or "application/octet-stream"
    file_name = original_name or doc.get("file_name") or "document"
    await sb.insert_document_access_log(
        bearer_token=ctx.token,
        payload={
            "document_id": doc.get("id"),
            "user_id": user_id,
            "viewer_id": ctx.user.user_id,
            "viewer_role": ctx.user.role,
            "reason": "authority_active_alert_context",
        },
    )
    return StreamingResponse(
        io.BytesIO(raw),
        media_type=mime,
        headers={"Content-Disposition": f'inline; filename="{file_name}"'},
    )


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
    dob: str | None = Form(None),  # DD-MM-YYYY or YYYY-MM-DD
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

    doc_payload: dict[str, Any] = {
        "user_id": ctx.user.user_id,
        "doc_type": doc_type,
        "file_name": file.filename,
        "mime_type": mime,
        "ocr_text": ocr_text or "",
        "extracted_name": extracted.name,
        "extracted_dob": extracted.dob.isoformat() if extracted.dob else None,
        "extraction_confidence": extracted.confidence,
        "verification_result": "MATCH" if verified else "NO_MATCH",
        "encrypted": False,
        "onchain_status": "SKIPPED",
        "onchain_chain": settings.blockchain_chain_name,
    }

    ipfs_result = None
    chain_result = None
    digital_id = make_digital_id(ctx.user.user_id)
    if verified and bool(profile.get("consent_blockchain_storage")):
        try:
            encrypted_payload = encrypt_document(raw=raw, file_name=file.filename, mime_type=mime)
            doc_payload["encrypted"] = True
            doc_payload["enc_alg"] = encrypted_payload.alg
            doc_payload["enc_nonce"] = encrypted_payload.nonce_b64

            ipfs = IpfsService()
            ipfs_result = await ipfs.upload_bytes(
                payload=encrypted_payload.payload_bytes,
                file_name=f"{ctx.user.user_id}-{(file.filename or 'document')}.enc.json",
            )
            doc_payload["ipfs_cid"] = ipfs_result["cid"]
            doc_payload["ipfs_uri"] = ipfs_result["uri"]
            doc_payload["ipfs_provider"] = ipfs_result["provider"]
            doc_payload["cid_hash"] = hashlib.sha256(ipfs_result["cid"].encode("utf-8")).hexdigest()

            chain = BlockchainService()
            chain_result = chain.write_document_proof(user_id=ctx.user.user_id, cid=ipfs_result["cid"], verified=verified)
            if chain_result.get("enabled"):
                doc_payload["onchain_tx_hash"] = chain_result.get("tx_hash")
                doc_payload["onchain_status"] = chain_result.get("status", "PENDING")
                doc_payload["onchain_contract_address"] = chain_result.get("contract_address")
            else:
                doc_payload["onchain_status"] = "SKIPPED"
        except Exception as e:
            doc_payload["onchain_status"] = "FAILED"
            doc_payload["ocr_text"] = (doc_payload.get("ocr_text") or "") + f"\n\n[proof_pipeline_error] {e}"

    doc_row = await sb.insert_user_document(bearer_token=ctx.token, payload=doc_payload)

    profile_update = None
    if verified and not profile.get("is_verified"):
        profile_update = await sb.update_profile(
            bearer_token=ctx.token,
            user_id=ctx.user.user_id,
            payload={"is_verified": True, "verified_at": _now_utc().isoformat()},
        )

    did_row = await sb.upsert_digital_id_registry(
        bearer_token=ctx.token,
        payload={
            "user_id": ctx.user.user_id,
            "digital_id": digital_id,
            "latest_document_id": doc_row.get("id"),
            "latest_ipfs_cid": doc_row.get("ipfs_cid"),
            "latest_tx_hash": doc_row.get("onchain_tx_hash"),
            "verified": bool(verified),
            "updated_at": _now_utc().isoformat(),
        },
    )

    return {
        "uploaded": True,
        "verified": verified,
        "verification_details": details,
        "document": doc_row,
        "profile_updated": profile_update,
        "digital_id": did_row,
        "ipfs": ipfs_result,
        "chain": chain_result,
    }


@app.post("/public/verification/upload-document")
async def public_upload_document_for_verification(
    file: UploadFile = File(...),
    doc_type: str = Form("OTHER"),
    full_name: str = Form(...),
    dob: str = Form(...),  # DD-MM-YYYY or YYYY-MM-DD
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


