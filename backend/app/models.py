from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


ZoneShapeType = Literal["CIRCLE", "POLYGON"]
AlertType = Literal["GEOFENCE", "SOS", "ANOMALY"]
AlertSource = Literal["rule_engine", "ai"]


class ZoneBase(BaseModel):
    name: str
    risk_level: int = 1
    shape_type: ZoneShapeType

    circle_center_lat: Optional[float] = None
    circle_center_lng: Optional[float] = None
    circle_radius_m: Optional[float] = None

    polygon_geojson: Optional[dict[str, Any]] = None


class ZoneCreate(ZoneBase):
    pass


class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    risk_level: Optional[int] = None

    shape_type: Optional[ZoneShapeType] = None
    circle_center_lat: Optional[float] = None
    circle_center_lng: Optional[float] = None
    circle_radius_m: Optional[float] = None
    polygon_geojson: Optional[dict[str, Any]] = None


class LocationPingIn(BaseModel):
    lat: float
    lng: float
    recorded_at: datetime

    accuracy_m: Optional[float] = None
    heading_deg: Optional[float] = None
    altitude_m: Optional[float] = None
    speed_mps: Optional[float] = None


class SosIn(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    summary: Optional[str] = None


class NearbyAlertsQuery(BaseModel):
    lat: float
    lng: float
    radius_m: Optional[int] = Field(default=None, ge=100)


class VerificationStatusOut(BaseModel):
    is_verified: bool
    verified_at: Optional[datetime] = None
    latest_document: Optional[dict[str, Any]] = None

