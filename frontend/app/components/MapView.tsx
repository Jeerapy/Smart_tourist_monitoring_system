"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useState } from "react";
import { Circle, CircleMarker, GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import { backendFetch } from "../../lib/backend";
import { Badge, GlassCard, InlineRow } from "./Ui";

type Zone = {
  id: string;
  name: string;
  risk_level: number;
  shape_type: "CIRCLE" | "POLYGON";
  circle_center_lat?: number | null;
  circle_center_lng?: number | null;
  circle_radius_m?: number | null;
  polygon_geojson?: any;
};

export type MapViewProps = {
  userLat?: number | null;
  userLng?: number | null;
  className?: string;
  showPanel?: boolean;
};

function clampRisk(risk: any): number {
  const n = Number(risk);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function riskColor(riskLevel: number): { stroke: string; fill: string } {
  const r = clampRisk(riskLevel);
  if (r <= 2) return { stroke: "#22c55e", fill: "rgba(34,197,94,0.20)" };
  if (r === 3) return { stroke: "#f59e0b", fill: "rgba(245,158,11,0.22)" };
  return { stroke: "#ef4444", fill: "rgba(239,68,68,0.20)" };
}

function toLatLngPairsFromGeoJson(geojson: any): [number, number][][] | null {
  // GeoJSON Polygon: { type: "Polygon", coordinates: [ [ [lng,lat], ... ] , ... ] }
  if (!geojson || typeof geojson !== "object") return null;
  if (geojson.type !== "Polygon") return null;
  if (!Array.isArray(geojson.coordinates) || geojson.coordinates.length === 0) return null;
  const rings = geojson.coordinates;
  const latlngRings: [number, number][][] = rings.map((ring: any[]) =>
    (ring || [])
      .map((p: any) => (Array.isArray(p) && p.length >= 2 ? [Number(p[1]), Number(p[0])] : null))
      .filter((x): x is [number, number] => !!x && Number.isFinite(x[0]) && Number.isFinite(x[1]))
  );
  return latlngRings;
}

export function MapView({ userLat, userLng, className, showPanel = true }: MapViewProps) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [zonesErr, setZonesErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const center = useMemo<[number, number]>(() => {
    if (typeof userLat === "number" && typeof userLng === "number") return [userLat, userLng];
    return [12.9716, 77.5946]; // fallback (Bengaluru)
  }, [userLat, userLng]);
  const mapKey = useMemo(() => `user-map-${center[0]}-${center[1]}`, [center]);

  async function loadZones() {
    setLoading(true);
    setZonesErr(null);
    try {
      const z = await backendFetch<Zone[]>("/zones");
      setZones(z || []);
    } catch (e: any) {
      setZonesErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadZones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const circles = zones.filter((z) => z.shape_type === "CIRCLE");
  const polygons = zones.filter((z) => z.shape_type === "POLYGON");

  return (
    <div className={className}>
      {showPanel && (
        <GlassCard
          title="Map"
          right={
            <InlineRow>
              {loading ? <Badge tone="neutral">Loading…</Badge> : <Badge tone="info">{zones.length} zones</Badge>}
              {zonesErr ? <Badge tone="danger">Zones error</Badge> : null}
            </InlineRow>
          }
          className="mb-4"
        >
          <div className="text-xs text-muted-foreground">
            Shows your live location and authority-configured danger zones (circles + polygons).
          </div>
        </GlassCard>
      )}

      <div className="glass-card-elevated overflow-hidden rounded-3xl">
        <MapContainer key={mapKey} center={center} zoom={14} style={{ height: 420, width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {typeof userLat === "number" && typeof userLng === "number" && (
            <CircleMarker
              center={[userLat, userLng]}
              radius={7}
              pathOptions={{ color: "#22d3ee", weight: 2, fillColor: "#22d3ee", fillOpacity: 0.95 }}
            />
          )}

          {circles.map((z) => {
            const lat = Number(z.circle_center_lat);
            const lng = Number(z.circle_center_lng);
            const r = Number(z.circle_radius_m);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(r)) return null;
            const c = riskColor(z.risk_level);
            return (
              <Circle
                key={z.id}
                center={[lat, lng]}
                radius={r}
                pathOptions={{ color: c.stroke, weight: 2, fillColor: c.stroke, fillOpacity: 0.25 }}
              />
            );
          })}

          {polygons.map((z) => {
            const latlngRings = toLatLngPairsFromGeoJson(z.polygon_geojson);
            if (!latlngRings || latlngRings.length === 0) return null;
            const c = riskColor(z.risk_level);

            // Rebuild GeoJSON into Leaflet-friendly coordinates by swapping to [lng,lat] is not needed here,
            // because react-leaflet GeoJSON expects GeoJSON; but we also want to ensure numeric values.
            // We'll keep original geojson if valid; otherwise make a sanitized one.
            const gj =
              z.polygon_geojson && z.polygon_geojson.type === "Polygon"
                ? z.polygon_geojson
                : {
                    type: "Polygon",
                    coordinates: latlngRings.map((ring) => ring.map(([lat, lng]) => [lng, lat])),
                  };

            return (
              <GeoJSON
                key={z.id}
                data={gj}
                style={{
                  color: c.stroke,
                  weight: 2,
                  fillColor: c.stroke,
                  fillOpacity: 0.18,
                }}
              />
            );
          })}
        </MapContainer>
      </div>

      {zonesErr ? (
        <div className="mt-3 text-xs text-critical/90">
          Failed to load zones. Make sure you are logged in and the backend is running. ({zonesErr})
        </div>
      ) : null}
    </div>
  );
}

