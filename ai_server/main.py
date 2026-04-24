from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import logging
import os
import re
from typing import Any, Optional

import httpx
import joblib
import numpy as np
from dotenv import load_dotenv
from sklearn.ensemble import IsolationForest
from sklearn.exceptions import NotFittedError

from fastapi import FastAPI
from fastapi import HTTPException
from pydantic import BaseModel, Field

load_dotenv()


app = FastAPI(title="Smart Tourist Monitoring - AI Server", version="0.2.0")
logger = logging.getLogger("ai_server")


def _now_utc() -> datetime:
    return datetime.now(tz=timezone.utc)


def _parse_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return int(raw)
    except Exception:
        return default


def _parse_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return float(raw)
    except Exception:
        return default


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_service_role_key: str

    ai_enabled: bool
    ai_fast_interval_sec: int
    ai_batch_interval_sec: int
    ai_window_minutes: int
    ai_fast_window_minutes: int
    ai_alert_dedup_sec: int

    model_path: str
    model_version: str
    anomaly_threshold: float


def _settings() -> Settings:
    supabase_url = (os.getenv("SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    enabled = (os.getenv("AI_ENABLED") or "true").strip().lower() in ("1", "true", "yes", "on")

    return Settings(
        supabase_url=supabase_url,
        supabase_service_role_key=key,
        ai_enabled=enabled,
        ai_fast_interval_sec=max(5, _parse_int("AI_FAST_INTERVAL_SEC", 15)),
        ai_batch_interval_sec=max(30, _parse_int("AI_BATCH_INTERVAL_SEC", 180)),
        ai_window_minutes=max(2, _parse_int("AI_WINDOW_MINUTES", 10)),
        ai_fast_window_minutes=max(1, _parse_int("AI_FAST_WINDOW_MINUTES", 2)),
        ai_alert_dedup_sec=max(30, _parse_int("AI_ALERT_DEDUP_SEC", 180)),
        model_path=(os.getenv("AI_MODEL_PATH") or "./model.joblib").strip(),
        model_version=(os.getenv("AI_MODEL_VERSION") or "iforest-v1").strip(),
        anomaly_threshold=_parse_float("AI_ANOMALY_THRESHOLD", 0.65),
    )


FEATURE_ORDER: list[str] = [
    # Time + sampling
    "window_seconds",
    "n_points",
    "max_gap_seconds",
    # Movement
    "total_distance_m",
    "net_displacement_m",
    "mean_speed_mps",
    "max_speed_mps",
    "max_accel_mps2",
    # Heading + stability
    "mean_heading_change_deg",
    "max_heading_change_deg",
    "mean_accuracy_m",
    "max_accuracy_m",
    # Inactivity
    "stationary_seconds",
    "stationary_ratio",
]


class SupabaseService:
    def __init__(self, base_url: str, service_role_key: str) -> None:
        self._base = base_url.rstrip("/")
        self._rest = f"{self._base}/rest/v1"
        self._key = service_role_key

    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self._key,
            "authorization": f"Bearer {self._key}",
            "content-type": "application/json",
        }

    async def get(self, path: str, params: Any) -> Any:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(f"{self._rest}/{path.lstrip('/')}", headers=self._headers(), params=params)
            r.raise_for_status()
            return r.json()

    async def post(self, path: str, payload: Any, prefer: str = "return=representation") -> Any:
        headers = self._headers()
        headers["prefer"] = prefer
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(f"{self._rest}/{path.lstrip('/')}", headers=headers, content=json.dumps(payload))
            if r.status_code >= 400:
                detail = r.text
                raise RuntimeError(f"Supabase POST {path} failed ({r.status_code}): {detail}")
            return r.json() if r.text else None

    async def list_recent_pings(self, since_iso: str, limit: int = 2000) -> list[dict[str, Any]]:
        return await self.get(
            "user_location_pings",
            params={
                "select": "user_id,lat,lng,recorded_at,accuracy_m,heading_deg,altitude_m,speed_mps",
                "recorded_at": f"gte.{since_iso}",
                "order": "recorded_at.asc",
                "limit": str(limit),
            },
        )

    async def list_user_pings_window(
        self,
        user_id: str,
        start_iso: str,
        end_iso: str,
        limit: int = 5000,
    ) -> list[dict[str, Any]]:
        return await self.get(
            "user_location_pings",
            params=[
                ("select", "user_id,lat,lng,recorded_at,accuracy_m,heading_deg,altitude_m,speed_mps"),
                ("user_id", f"eq.{user_id}"),
                ("recorded_at", f"gte.{start_iso}"),
                ("recorded_at", f"lte.{end_iso}"),
                ("order", "recorded_at.asc"),
                ("limit", str(limit)),
            ],
        )

    async def list_active_users(self, active_after_iso: str, limit: int = 2000) -> list[str]:
        rows = await self.get(
            "user_last_location",
            params={"select": "user_id,recorded_at", "recorded_at": f"gte.{active_after_iso}", "limit": str(limit)},
        )
        return [str(r["user_id"]) for r in rows if r.get("user_id")]

    async def find_recent_ai_alerts(self, user_id: str, created_after_iso: str) -> list[dict[str, Any]]:
        return await self.get(
            "alerts",
            params={
                "select": "id,created_at,type,source,risk_level,severity,summary",
                "user_id": f"eq.{user_id}",
                "type": "eq.ANOMALY",
                "source": "eq.ai",
                "created_at": f"gte.{created_after_iso}",
                "order": "created_at.desc",
                "limit": "1",
            },
        )

    async def create_ai_alert(self, payload: dict[str, Any]) -> dict[str, Any]:
        # Backward-compatible insert:
        # If DB schema cache is behind and misses new AI columns,
        # remove only the unknown column and retry.
        working = dict(payload)
        for _ in range(6):
            try:
                rows = await self.post("alerts", payload=working)
                return rows[0] if rows else {}
            except Exception as e:
                msg = str(e)
                m = re.search(r"Could not find the '([^']+)' column of 'alerts' in the schema cache", msg)
                if not m:
                    raise
                missing_col = m.group(1)
                if missing_col not in working:
                    raise
                working.pop(missing_col, None)
                logger.warning("Retrying alerts insert without missing column: %s", missing_col)
        raise RuntimeError("Failed to insert AI alert after schema-compat retries.")

    async def insert_ai_detection(self, payload: dict[str, Any]) -> dict[str, Any]:
        rows = await self.post("ai_detections", payload=payload)
        return rows[0] if rows else {}


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1 = np.radians(lat1)
    p2 = np.radians(lat2)
    dlat = np.radians(lat2 - lat1)
    dlng = np.radians(lng2 - lng1)
    a = np.sin(dlat / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlng / 2) ** 2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    return float(r * c)


def _to_dt(v: Any) -> Optional[datetime]:
    if v is None:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None


def _json_number(v: Any) -> Optional[float]:
    try:
        fv = float(v)
    except Exception:
        return None
    if not np.isfinite(fv):
        return None
    return fv


def compute_features(pings: list[dict[str, Any]], window_start: datetime, window_end: datetime) -> dict[str, float]:
    pts = [p for p in pings if p.get("lat") is not None and p.get("lng") is not None and p.get("recorded_at")]
    if len(pts) < 2:
        ws = max(1.0, (window_end - window_start).total_seconds())
        return {
            "window_seconds": float(ws),
            "n_points": float(len(pts)),
            "max_gap_seconds": float(ws),
            "total_distance_m": 0.0,
            "net_displacement_m": 0.0,
            "mean_speed_mps": 0.0,
            "max_speed_mps": 0.0,
            "max_accel_mps2": 0.0,
            "mean_heading_change_deg": 0.0,
            "max_heading_change_deg": 0.0,
            "mean_accuracy_m": float(np.nan),
            "max_accuracy_m": float(np.nan),
            "stationary_seconds": float(ws),
            "stationary_ratio": 1.0,
        }

    # Sort by time
    pts.sort(key=lambda x: str(x.get("recorded_at")))
    times = [_to_dt(p["recorded_at"]) for p in pts]
    coords = [(float(p["lat"]), float(p["lng"])) for p in pts]
    headings = [p.get("heading_deg") for p in pts]
    accuracies = [p.get("accuracy_m") for p in pts]
    ws = max(1.0, (window_end - window_start).total_seconds())

    # Gaps
    gaps = []
    for i in range(1, len(times)):
        if times[i] and times[i - 1]:
            gaps.append(max(0.0, (times[i] - times[i - 1]).total_seconds()))
    max_gap = float(max(gaps) if gaps else ws)

    # Distances and speeds
    distances = []
    dt_list = []
    for i in range(1, len(coords)):
        lat1, lng1 = coords[i - 1]
        lat2, lng2 = coords[i]
        d = _haversine_m(lat1, lng1, lat2, lng2)
        distances.append(d)
        dt = 0.0
        if times[i] and times[i - 1]:
            dt = max(0.001, (times[i] - times[i - 1]).total_seconds())
        else:
            dt = 1.0
        dt_list.append(dt)

    total_distance = float(np.sum(distances)) if distances else 0.0
    net_disp = _haversine_m(coords[0][0], coords[0][1], coords[-1][0], coords[-1][1])
    inst_speeds = [d / dt for d, dt in zip(distances, dt_list)] if distances else [0.0]
    mean_speed = float(np.mean(inst_speeds)) if inst_speeds else 0.0
    max_speed = float(np.max(inst_speeds)) if inst_speeds else 0.0

    # Acceleration
    accels = []
    for i in range(1, len(inst_speeds)):
        dv = inst_speeds[i] - inst_speeds[i - 1]
        dt = dt_list[i] if i < len(dt_list) else 1.0
        accels.append(dv / max(0.001, dt))
    max_accel = float(np.max(np.abs(accels))) if accels else 0.0

    # Heading changes (wrap-aware)
    def _angle_delta(a: float, b: float) -> float:
        d = (b - a + 180.0) % 360.0 - 180.0
        return abs(d)

    heading_deltas = []
    clean_heads = [float(h) for h in headings if h is not None]
    if len(clean_heads) >= 2:
        for i in range(1, len(clean_heads)):
            heading_deltas.append(_angle_delta(clean_heads[i - 1], clean_heads[i]))
    mean_hchg = float(np.mean(heading_deltas)) if heading_deltas else 0.0
    max_hchg = float(np.max(heading_deltas)) if heading_deltas else 0.0

    # Accuracy stats
    clean_acc = [float(a) for a in accuracies if a is not None]
    mean_acc = float(np.mean(clean_acc)) if clean_acc else float(np.nan)
    max_acc = float(np.max(clean_acc)) if clean_acc else float(np.nan)

    # Stationary: treat low displacement between consecutive points as stationary
    stationary_threshold_m = 8.0
    stationary_seconds = 0.0
    for d, dt in zip(distances, dt_list):
        if d <= stationary_threshold_m:
            stationary_seconds += dt
    stationary_ratio = float(min(1.0, stationary_seconds / ws))

    return {
        "window_seconds": float(ws),
        "n_points": float(len(pts)),
        "max_gap_seconds": float(max_gap),
        "total_distance_m": float(total_distance),
        "net_displacement_m": float(net_disp),
        "mean_speed_mps": float(mean_speed),
        "max_speed_mps": float(max_speed),
        "max_accel_mps2": float(max_accel),
        "mean_heading_change_deg": float(mean_hchg),
        "max_heading_change_deg": float(max_hchg),
        "mean_accuracy_m": float(mean_acc),
        "max_accuracy_m": float(max_acc),
        "stationary_seconds": float(stationary_seconds),
        "stationary_ratio": float(stationary_ratio),
    }


class ModelManager:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._lock = asyncio.Lock()
        self._model: IsolationForest | None = None

    async def load(self) -> IsolationForest:
        async with self._lock:
            if self._model is not None:
                return self._model
            if os.path.exists(self._settings.model_path):
                self._model = joblib.load(self._settings.model_path)
            else:
                # Fallback untrained model; useful to keep server running before training.
                self._model = IsolationForest(
                    n_estimators=200,
                    contamination="auto",
                    random_state=42,
                )
            return self._model

    async def save(self, model: IsolationForest) -> None:
        async with self._lock:
            os.makedirs(os.path.dirname(os.path.abspath(self._settings.model_path)) or ".", exist_ok=True)
            joblib.dump(model, self._settings.model_path)
            self._model = model

    def vectorize(self, features: dict[str, Any]) -> np.ndarray:
        vec = []
        for k in FEATURE_ORDER:
            v = features.get(k)
            try:
                fv = float(v)
            except Exception:
                fv = float("nan")
            if not np.isfinite(fv):
                fv = 0.0
            vec.append(fv)
        return np.array(vec, dtype=np.float64).reshape(1, -1)

    async def score(self, features: dict[str, Any]) -> float:
        model = await self.load()
        x = self.vectorize(features)
        # IsolationForest score_samples: higher means more normal.
        s = float(model.score_samples(x)[0])
        anomaly_score = max(0.0, min(1.0, (-(s) + 0.5) / 1.5))
        return anomaly_score


class AnomalyCheckIn(BaseModel):
    user_id: str
    features: dict[str, Any]


class PingPointIn(BaseModel):
    lat: float
    lng: float
    recorded_at: datetime
    accuracy_m: Optional[float] = None
    heading_deg: Optional[float] = None
    altitude_m: Optional[float] = None
    speed_mps: Optional[float] = None


class AnomalyFromPingsIn(BaseModel):
    user_id: str
    pings: list[PingPointIn]


class TrainIn(BaseModel):
    days: int = Field(default=7, ge=1, le=180)
    window_minutes: int = Field(default=10, ge=2, le=120)
    max_samples: int = Field(default=30000, ge=200, le=200000)


class TrainOut(BaseModel):
    trained: bool
    model_path: str
    model_version: str
    samples: int
    feature_order: list[str]


class RunOnceOut(BaseModel):
    ran: bool
    mode: str
    evaluated_users: int
    created_alerts: int


_model_mgr: ModelManager | None = None
_last_fast_checked: dict[str, datetime] = {}
_last_seen_ping: dict[str, datetime] = {}


def _require_config(s: Settings) -> None:
    if not s.supabase_url or not s.supabase_service_role_key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for AI server.")


async def _train_model(sb: SupabaseService, mgr: ModelManager, s: Settings, body: TrainIn) -> TrainOut:
    since = (_now_utc() - timedelta(days=body.days)).isoformat()
    pings = await sb.list_recent_pings(since_iso=since, limit=body.max_samples)

    # Build windows per user by simple chunking over time.
    by_user: dict[str, list[dict[str, Any]]] = {}
    for p in pings:
        uid = str(p.get("user_id") or "")
        if not uid:
            continue
        by_user.setdefault(uid, []).append(p)

    samples: list[np.ndarray] = []
    for uid, ups in by_user.items():
        ups.sort(key=lambda x: str(x.get("recorded_at")))
        # Non-overlapping windows
        w = timedelta(minutes=body.window_minutes)
        start = _to_dt(ups[0]["recorded_at"]) or _now_utc()
        end = start + w
        buf: list[dict[str, Any]] = []
        for p in ups:
            t = _to_dt(p.get("recorded_at"))
            if not t:
                continue
            while t > end:
                feats = compute_features(buf, start, end)
                samples.append(mgr.vectorize(feats))
                start = end
                end = start + w
                buf = []
            buf.append(p)
        if buf:
            feats = compute_features(buf, start, end)
            samples.append(mgr.vectorize(feats))

        if len(samples) >= body.max_samples:
            break

    if not samples:
        return TrainOut(
            trained=False,
            model_path=s.model_path,
            model_version=s.model_version,
            samples=0,
            feature_order=FEATURE_ORDER,
        )

    x = np.vstack(samples)
    model = IsolationForest(n_estimators=300, contamination="auto", random_state=42)
    model.fit(x)
    await mgr.save(model)
    return TrainOut(
        trained=True,
        model_path=s.model_path,
        model_version=s.model_version,
        samples=int(x.shape[0]),
        feature_order=FEATURE_ORDER,
    )


def _risk_from_score(score01: float) -> tuple[int, int]:
    # (risk_level, severity)
    if score01 >= 0.9:
        return (5, 5)
    if score01 >= 0.8:
        return (4, 4)
    if score01 >= 0.7:
        return (3, 3)
    if score01 >= 0.65:
        return (2, 2)
    return (1, 1)


async def _maybe_create_alert(
    sb: SupabaseService,
    s: Settings,
    mgr: ModelManager,
    user_id: str,
    pings: list[dict[str, Any]],
    window_start: datetime,
    window_end: datetime,
) -> bool:
    if len(pings) < 2:
        return False

    feats = compute_features(pings, window_start, window_end)
    score01 = await mgr.score(feats)
    if score01 < s.anomaly_threshold:
        return False

    dedup_after = (_now_utc() - timedelta(seconds=s.ai_alert_dedup_sec)).isoformat()
    recent = await sb.find_recent_ai_alerts(user_id=user_id, created_after_iso=dedup_after)
    if recent:
        return False

    risk_level, severity = _risk_from_score(score01)
    last = pings[-1]
    trigger_lat = float(last.get("lat")) if last.get("lat") is not None else None
    trigger_lng = float(last.get("lng")) if last.get("lng") is not None else None

    reason = "anomaly_score_high"
    summary = f"AI anomaly detected (score={score01:.2f})"
    alert_payload = {
        "user_id": user_id,
        "type": "ANOMALY",
        "status": "OPEN",
        "severity": severity,
        "source": "ai",
        "risk_level": risk_level,
        "summary": summary,
        "trigger_lat": trigger_lat,
        "trigger_lng": trigger_lng,
        "ai_score": score01,
        "ai_reason": reason,
        "ai_model_version": s.model_version,
        # keep small
        "ai_features": {k: _json_number(feats.get(k)) for k in list(feats.keys())[:10]},
    }
    try:
        await sb.create_ai_alert(alert_payload)
        # Audit insert is best-effort; do not downgrade a successful alert.
        detection_payload = {
            "user_id": user_id,
            "kind": "ANOMALY",
            "score": score01,
            "model_version": s.model_version,
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
            "features": {k: _json_number(feats.get(k)) for k in feats.keys()},
        }
        if isinstance(detection_payload.get("features"), dict):
            detection_payload["features"] = {
                k: v for k, v in detection_payload["features"].items() if v is not None
            }
        try:
            await sb.insert_ai_detection(detection_payload)
        except Exception as e:
            logger.warning("AI alert persisted but ai_detections audit failed for user_id=%s: %s", user_id, e)
        return True
    except Exception as e:
        # Don't fail the full batch for one invalid row/schema mismatch.
        logger.exception("Failed to persist AI alert for user_id=%s: %s", user_id, e)
        return False


async def run_fast_once(sb: SupabaseService, mgr: ModelManager, s: Settings) -> tuple[int, int]:
    now = _now_utc()
    since = (now - timedelta(minutes=s.ai_fast_window_minutes)).isoformat()
    rows = await sb.list_recent_pings(since_iso=since, limit=3000)

    by_user: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        uid = str(r.get("user_id") or "")
        if not uid:
            continue
        by_user.setdefault(uid, []).append(r)

    evaluated = 0
    created = 0
    for uid, pings in by_user.items():
        # only re-evaluate if we have a new ping timestamp
        last_t = _to_dt(pings[-1].get("recorded_at"))
        if not last_t:
            continue
        prev_seen = _last_seen_ping.get(uid)
        if prev_seen and last_t <= prev_seen:
            continue
        _last_seen_ping[uid] = last_t

        evaluated += 1
        w_end = last_t
        w_start = w_end - timedelta(minutes=s.ai_fast_window_minutes)
        created_now = await _maybe_create_alert(sb, s, mgr, uid, pings, w_start, w_end)
        if created_now:
            created += 1

    return evaluated, created


async def run_batch_once(sb: SupabaseService, mgr: ModelManager, s: Settings) -> tuple[int, int]:
    now = _now_utc()
    active_after = (now - timedelta(hours=2)).isoformat()
    users = await sb.list_active_users(active_after_iso=active_after, limit=5000)
    evaluated = 0
    created = 0
    for uid in users:
        evaluated += 1
        w_end = now
        w_start = now - timedelta(minutes=s.ai_window_minutes)
        pings = await sb.list_user_pings_window(user_id=uid, start_iso=w_start.isoformat(), end_iso=w_end.isoformat())
        created_now = await _maybe_create_alert(sb, s, mgr, uid, pings, w_start, w_end)
        if created_now:
            created += 1
    return evaluated, created


async def _fast_loop(sb: SupabaseService, mgr: ModelManager, s: Settings) -> None:
    while True:
        try:
            await run_fast_once(sb, mgr, s)
        except Exception:
            # Keep loop alive; errors are visible in logs.
            pass
        await asyncio.sleep(s.ai_fast_interval_sec)


async def _batch_loop(sb: SupabaseService, mgr: ModelManager, s: Settings) -> None:
    while True:
        try:
            await run_batch_once(sb, mgr, s)
        except Exception:
            pass
        await asyncio.sleep(s.ai_batch_interval_sec)


@app.on_event("startup")
async def _on_startup() -> None:
    s = _settings()
    if not s.ai_enabled:
        return
    _require_config(s)
    global _model_mgr
    _model_mgr = ModelManager(s)
    sb = SupabaseService(s.supabase_url, s.supabase_service_role_key)
    mgr = _model_mgr
    asyncio.create_task(_fast_loop(sb, mgr, s))
    asyncio.create_task(_batch_loop(sb, mgr, s))


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/anomaly/check")
async def anomaly_check(body: AnomalyCheckIn) -> dict[str, Any]:
    s = _settings()
    _require_config(s)
    mgr = _model_mgr or ModelManager(s)
    try:
        score01 = await mgr.score(body.features)
    except NotFittedError:
        raise HTTPException(status_code=400, detail="Model is not trained yet. Call /train first.")
    return {
        "user_id": body.user_id,
        "anomaly": bool(score01 >= s.anomaly_threshold),
        "score": score01,
        "threshold": s.anomaly_threshold,
        "model_version": s.model_version,
        "feature_order": FEATURE_ORDER,
    }


@app.post("/anomaly/check-from-pings")
async def anomaly_check_from_pings(body: AnomalyFromPingsIn) -> dict[str, Any]:
    s = _settings()
    mgr = _model_mgr or ModelManager(s)

    if len(body.pings) < 2:
        raise HTTPException(status_code=400, detail="At least 2 pings are required.")

    pings = [p.model_dump(mode="json") for p in body.pings]
    pings.sort(key=lambda x: str(x.get("recorded_at")))
    window_start = _to_dt(pings[0].get("recorded_at"))
    window_end = _to_dt(pings[-1].get("recorded_at"))
    if not window_start or not window_end:
        raise HTTPException(status_code=400, detail="Invalid ping timestamps.")

    features = compute_features(pings=pings, window_start=window_start, window_end=window_end)
    try:
        score01 = await mgr.score(features)
    except NotFittedError:
        raise HTTPException(status_code=400, detail="Model is not trained yet. Call /train first.")

    return {
        "user_id": body.user_id,
        "anomaly": bool(score01 >= s.anomaly_threshold),
        "score": score01,
        "threshold": s.anomaly_threshold,
        "model_version": s.model_version,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "features": features,
        "feature_order": FEATURE_ORDER,
    }


@app.post("/train", response_model=TrainOut)
async def train(body: TrainIn) -> TrainOut:
    s = _settings()
    _require_config(s)
    sb = SupabaseService(s.supabase_url, s.supabase_service_role_key)
    mgr = _model_mgr or ModelManager(s)
    out = await _train_model(sb, mgr, s, body)
    return out


@app.post("/run/once", response_model=RunOnceOut)
async def run_once(mode: str = "fast") -> RunOnceOut:
    s = _settings()
    _require_config(s)
    sb = SupabaseService(s.supabase_url, s.supabase_service_role_key)
    mgr = _model_mgr or ModelManager(s)
    if mode == "batch":
        evaluated, created = await run_batch_once(sb, mgr, s)
        return RunOnceOut(ran=True, mode="batch", evaluated_users=evaluated, created_alerts=created)
    evaluated, created = await run_fast_once(sb, mgr, s)
    return RunOnceOut(ran=True, mode="fast", evaluated_users=evaluated, created_alerts=created)

