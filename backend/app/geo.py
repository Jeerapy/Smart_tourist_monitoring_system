from __future__ import annotations

import math
from typing import Any, Iterable, Optional


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def point_in_circle(lat: float, lng: float, c_lat: float, c_lng: float, radius_m: float) -> bool:
    return haversine_m(lat, lng, c_lat, c_lng) <= radius_m


def _extract_polygon_rings(geojson: dict[str, Any]) -> Optional[list[list[list[float]]]]:
    # Expects GeoJSON Polygon: {"type":"Polygon","coordinates":[ [ [lng,lat], ... ] , ... ]}
    if not isinstance(geojson, dict):
        return None
    if geojson.get("type") != "Polygon":
        return None
    coords = geojson.get("coordinates")
    if not isinstance(coords, list) or not coords:
        return None
    return coords


def point_in_polygon(lat: float, lng: float, polygon_geojson: dict[str, Any]) -> bool:
    rings = _extract_polygon_rings(polygon_geojson)
    if not rings:
        return False

    # Ray casting on outer ring only (MVP).
    ring = rings[0]
    inside = False
    n = len(ring)
    if n < 3:
        return False

    x = lng
    y = lat
    for i in range(n):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]

        intersects = ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-15) + x1)
        if intersects:
            inside = not inside
    return inside


def point_in_zone(lat: float, lng: float, zone: dict[str, Any]) -> bool:
    st = zone.get("shape_type")
    if st == "CIRCLE":
        c_lat = zone.get("circle_center_lat")
        c_lng = zone.get("circle_center_lng")
        r_m = zone.get("circle_radius_m")
        if c_lat is None or c_lng is None or r_m is None:
            return False
        return point_in_circle(lat, lng, float(c_lat), float(c_lng), float(r_m))
    if st == "POLYGON":
        gj = zone.get("polygon_geojson")
        if not gj:
            return False
        return point_in_polygon(lat, lng, gj)
    return False

