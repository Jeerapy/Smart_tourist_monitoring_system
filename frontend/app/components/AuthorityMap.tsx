"use client";

import { useMemo } from "react";
import { Circle, CircleMarker, MapContainer, TileLayer } from "react-leaflet";
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
  const mapKey = useMemo(() => `authority-map-${center[0]}-${center[1]}`, [center]);

  return (
    <div className="glass-card-elevated overflow-hidden rounded-3xl">
      <MapContainer key={mapKey} center={center} zoom={13} style={{ height: 460, width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {typeof authorityLat === "number" && typeof authorityLng === "number" && (
          <CircleMarker
            center={[authorityLat, authorityLng]}
            radius={7}
            pathOptions={{ color: "#22d3ee", weight: 2, fillColor: "#22d3ee", fillOpacity: 0.95 }}
          />
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
          const color = isSelected ? "#f43f5e" : "#ef4444";
          return (
            <CircleMarker
              key={a.id}
              center={[lat, lng]}
              radius={7}
              pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.95 }}
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

