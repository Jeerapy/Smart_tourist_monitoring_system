export type AlertType = "GEOFENCE" | "SOS";
export type AlertStatus = "OPEN" | "ACKED" | "RESOLVED";

export type DangerZone = {
  id: string;
  name: string;
  risk_level: number;
  shape_type: "CIRCLE" | "POLYGON";
  circle_center_lat?: number | null;
  circle_center_lng?: number | null;
  circle_radius_m?: number | null;
  created_at?: string;
};

export type LastLocation = {
  user_id: string;
  lat: number;
  lng: number;
  recorded_at?: string;
};

export type NearbyAlert = {
  id: string;
  user_id: string;
  type: AlertType;
  status: AlertStatus;
  severity: number;
  risk_level: number;
  summary: string;
  trigger_lat?: number | null;
  trigger_lng?: number | null;
  created_at?: string;
  distance_m?: number;
  user_last_location?: LastLocation;
};

export type NearbyAlertsResponse = {
  radius_m: number;
  count: number;
  alerts: NearbyAlert[];
};

export type AlertSortKey = "distance_asc" | "distance_desc" | "risk_desc" | "time_desc";

export type AlertFilterState = {
  query: string;
  type: "ALL" | AlertType;
  maxDistanceM: number | null;
  minRiskLevel: number | null;
  sort: AlertSortKey;
};

export function toNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  const a = toNumber(lat);
  const b = toNumber(lng);
  return a !== null && b !== null && a >= -90 && a <= 90 && b >= -180 && b <= 180;
}

export function riskTone(riskLevel: number): "success" | "warning" | "danger" {
  if (riskLevel <= 2) return "success";
  if (riskLevel === 3) return "warning";
  return "danger";
}

export function applyAlertFilters(alerts: NearbyAlert[], filters: AlertFilterState): NearbyAlert[] {
  const q = (filters.query || "").trim().toLowerCase();
  const out = alerts.filter((a) => {
    if (filters.type !== "ALL" && a.type !== filters.type) return false;
    if (typeof filters.minRiskLevel === "number" && (a.risk_level || 0) < filters.minRiskLevel) return false;
    if (typeof filters.maxDistanceM === "number" && (a.distance_m || 0) > filters.maxDistanceM) return false;
    if (!q) return true;
    const hay = `${a.summary || ""} ${a.user_id || ""} ${a.type || ""}`.toLowerCase();
    return hay.includes(q);
  });

  out.sort((a, b) => {
    if (filters.sort === "distance_asc") return (a.distance_m || 0) - (b.distance_m || 0);
    if (filters.sort === "distance_desc") return (b.distance_m || 0) - (a.distance_m || 0);
    if (filters.sort === "risk_desc") return (b.risk_level || 0) - (a.risk_level || 0);
    const ta = Date.parse(a.created_at || "") || 0;
    const tb = Date.parse(b.created_at || "") || 0;
    return tb - ta;
  });

  return out;
}

