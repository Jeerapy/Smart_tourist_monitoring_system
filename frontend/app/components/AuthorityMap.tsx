"use client";

import L from "leaflet";
import { useMemo } from "react";
import { Circle, MapContainer, Marker, TileLayer } from "react-leaflet";
import type { DangerZone, NearbyAlert } from "../../lib/authority";

type Props = {
  authorityLat: number | null;
  authorityLng: number | null;
  alerts: NearbyAlert[];
  zones: DangerZone[];
  selectedAlertId?: string | null;
  onSelectAlert?: (alertId: string) => void;
};

function riskColor(riskLevel: number): string {
  if (riskLevel <= 2) return "#22c55e";
  if (riskLevel === 3) return "#f59e0b";
  return "#ef4444";
}

function makeDotIcon(color: string) {
  return new L.DivIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:999px;background:${color};box-shadow:0 0 0 4px ${color}33,0 8px 20px ${color}55;border:1px solid rgba(255,255,255,0.35)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export function AuthorityMap({
  authorityLat,
  authorityLng,
  alerts,
  zones,
  selectedAlertId,
  onSelectAlert,
}: Props) {
  const center = useMemo<[number, number]>(() => {
    if (typeof authorityLat === "number" && typeof authorityLng === "number") return [authorityLat, authorityLng];
    return [12.9716, 77.5946];
  }, [authorityLat, authorityLng]);

  const authorityIcon = useMemo(() => makeDotIcon("rgba(34,211,238,0.95)"), []);

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
      <MapContainer center={center} zoom={13} style={{ height: 460, width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {typeof authorityLat === "number" && typeof authorityLng === "number" && (
          <Marker position={[authorityLat, authorityLng]} icon={authorityIcon} />
        )}

        {zones
          .filter((z) => z.shape_type === "CIRCLE")
          .map((z) => {
            const lat = Number(z.circle_center_lat);
            const lng = Number(z.circle_center_lng);
            const radius = Number(z.circle_radius_m);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius)) return null;
            const c = riskColor(z.risk_level || 1);
            return (
              <Circle
                key={z.id}
                center={[lat, lng]}
                radius={radius}
                pathOptions={{ color: c, weight: 2, fillColor: c, fillOpacity: 0.18 }}
              />
            );
          })}

        {alerts.map((a) => {
          const lat = Number(a.user_last_location?.lat ?? a.trigger_lat);
          const lng = Number(a.user_last_location?.lng ?? a.trigger_lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const isSelected = selectedAlertId === a.id;
          const color = isSelected ? "rgba(244,63,94,0.95)" : "rgba(239,68,68,0.95)";
          const icon = makeDotIcon(color);
          return (
            <Marker
              key={a.id}
              position={[lat, lng]}
              icon={icon}
              eventHandlers={{
                click: () => onSelectAlert?.(a.id),
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}

