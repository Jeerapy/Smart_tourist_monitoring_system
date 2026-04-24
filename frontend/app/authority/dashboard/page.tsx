"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "../../../lib/supabaseClient";
import { backendFetch, backendFetchBlob } from "../../../lib/backend";
import {
  applyAlertFilters,
  type AlertFilterState,
  type DangerZone,
  type NearbyAlert,
  type NearbyAlertsResponse,
  riskTone,
} from "../../../lib/authority";
import { Badge, Button, Container, Field, GlassCard, InlineRow, Modal, Pre, Toast } from "../../components/Ui";

const AuthorityMap = dynamic(() => import("../../components/AuthorityMap").then((m) => m.AuthorityMap), {
  ssr: false,
});

export default function AuthorityDashboard() {
  const [me, setMe] = useState<any>(null);
  const [zones, setZones] = useState<DangerZone[]>([]);
  const [nearby, setNearby] = useState<NearbyAlertsResponse | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pollEnabled, setPollEnabled] = useState(true);
  const [pollSec, setPollSec] = useState("12");
  const [radiusM, setRadiusM] = useState("20000");
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const [aLat, setALat] = useState("12.9716");
  const [aLng, setALng] = useState("77.5946");
  const [geoErr, setGeoErr] = useState<string | null>(null);

  const [zoneName, setZoneName] = useState("City Center Risk Zone");
  const [riskLevel, setRiskLevel] = useState("3");
  const [zLat, setZLat] = useState("12.9716");
  const [zLng, setZLng] = useState("77.5946");
  const [circleRadiusM, setCircleRadiusM] = useState("600");
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [showDeleteZone, setShowDeleteZone] = useState<string | null>(null);

  const [filters, setFilters] = useState<AlertFilterState>({
    query: "",
    type: "ALL",
    minRiskLevel: null,
    maxDistanceM: null,
    sort: "distance_asc",
  });

  const [toastOpen, setToastOpen] = useState(false);
  const [toastTone, setToastTone] = useState<"info" | "success" | "warning" | "danger">("info");
  const [toastTitle, setToastTitle] = useState(" ");
  const [toastMessage, setToastMessage] = useState<string | undefined>(undefined);
  const [docBusy, setDocBusy] = useState(false);

  function showToast(tone: "info" | "success" | "warning" | "danger", title: string, message?: string) {
    setToastTone(tone);
    setToastTitle(title);
    setToastMessage(message);
    setToastOpen(true);
  }

  const filteredAlerts = useMemo(
    () => applyAlertFilters(nearby?.alerts || [], filters),
    [nearby?.alerts, filters]
  );
  const selectedAlert = useMemo(
    () => filteredAlerts.find((a) => a.id === selectedAlertId) || null,
    [filteredAlerts, selectedAlertId]
  );

  async function loadMe() {
    const m = await backendFetch<{ user_id: string; role: "authority" | "user" }>("/me");
    setMe(m);
    if (m.role !== "authority") {
      throw new Error("Logged in account is not an authority.");
    }
  }

  async function loadZones() {
    const z = await backendFetch<DangerZone[]>("/zones");
    setZones(z || []);
  }

  async function loadNearbyAlerts() {
    const lat = Number(aLat);
    const lng = Number(aLng);
    const rad = Number(radiusM);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(rad)) return;

    const res = await backendFetch<NearbyAlertsResponse>(
      `/authority/alerts/nearby?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(
        String(lng)
      )}&radius_m=${encodeURIComponent(String(rad))}`
    );
    setNearby(res);
    if (!selectedAlertId && res.alerts?.[0]?.id) setSelectedAlertId(res.alerts[0].id);
  }

  async function loadAll() {
    setBusy(true);
    try {
      await loadMe();
      await Promise.allSettled([loadZones(), loadNearbyAlerts()]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Try using device location for authority's "nearby" center.
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setALat(String(pos.coords.latitude));
        setALng(String(pos.coords.longitude));
      },
      (err) => {
        setGeoErr(err.message || "Could not fetch your location");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 8000 }
    );
  }, []);

  useEffect(() => {
    loadAll().catch((e) => {
      showToast("danger", "Failed to load dashboard", String(e));
      setMe({ error: String(e) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aLat, aLng, radiusM]);

  useEffect(() => {
    if (!pollEnabled) return;
    const sec = Math.max(5, Number(pollSec) || 12);
    const timer = window.setInterval(() => {
      loadNearbyAlerts().catch(() => {});
    }, sec * 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollEnabled, pollSec, aLat, aLng, radiusM]);

  function resetZoneForm() {
    setEditingZoneId(null);
    setZoneName("City Center Risk Zone");
    setRiskLevel("3");
    setZLat(aLat || "12.9716");
    setZLng(aLng || "77.5946");
    setCircleRadiusM("600");
  }

  async function createOrUpdateCircleZone() {
    const lat = Number(zLat);
    const lng = Number(zLng);
    const risk = Number(riskLevel);
    const radius = Number(circleRadiusM);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(risk) || !Number.isFinite(radius)) {
      showToast("warning", "Invalid zone input", "Please provide valid numeric values.");
      return;
    }

    const payload = {
      name: zoneName,
      risk_level: risk,
      shape_type: "CIRCLE",
      circle_center_lat: lat,
      circle_center_lng: lng,
      circle_radius_m: radius,
    };

    if (editingZoneId) {
      await backendFetch(`/zones/${editingZoneId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      showToast("success", "Zone updated");
    } else {
      await backendFetch("/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      showToast("success", "Zone created");
    }
    resetZoneForm();
    await loadZones();
  }

  async function deleteZone(zoneId: string) {
    await backendFetch(`/zones/${zoneId}`, { method: "DELETE" });
    showToast("success", "Zone deleted");
    setShowDeleteZone(null);
    if (editingZoneId === zoneId) resetZoneForm();
    await loadZones();
  }

  async function ack(alertId: string) {
    setActionBusyId(alertId);
    try {
      await backendFetch(`/authority/alerts/${alertId}/ack`, { method: "POST" });
      showToast("success", "Alert acknowledged");
      await loadNearbyAlerts();
    } finally {
      setActionBusyId(null);
    }
  }

  async function resolve(alertId: string) {
    setActionBusyId(alertId);
    try {
      await backendFetch(`/authority/alerts/${alertId}/resolve`, { method: "POST" });
      showToast("success", "Alert resolved");
      await loadNearbyAlerts();
    } finally {
      setActionBusyId(null);
    }
  }

  function beginEditZone(zone: DangerZone) {
    setEditingZoneId(zone.id);
    setZoneName(zone.name || "Zone");
    setRiskLevel(String(zone.risk_level || 1));
    setZLat(String(zone.circle_center_lat ?? ""));
    setZLng(String(zone.circle_center_lng ?? ""));
    setCircleRadiusM(String(zone.circle_radius_m ?? ""));
  }

  async function viewLatestDocumentForSelectedAlert() {
    if (!selectedAlert?.user_id) return;
    setDocBusy(true);
    try {
      const latest = await backendFetch<{ document: { id: string } }>(
        `/authority/users/${encodeURIComponent(selectedAlert.user_id)}/documents/latest`
      );
      const docId = latest?.document?.id;
      if (!docId) throw new Error("No latest document found for this user");
      const blob = await backendFetchBlob(`/authority/documents/${encodeURIComponent(docId)}/view`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      showToast("success", "Document opened");
    } catch (e: any) {
      showToast("danger", "Document view failed", e?.message ?? String(e));
    } finally {
      setDocBusy(false);
    }
  }

  return (
    <Container className="pt-10">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Authority dashboard</h1>
          <div className="mt-1 text-sm text-muted-foreground">Monitor nearby incidents, respond, and manage danger zones.</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge tone="info">{nearby?.count || 0} nearby alerts</Badge>
          <Badge tone="neutral">{zones.length} zones</Badge>
          <Button variant="secondary" disabled={busy} onClick={() => loadAll()}>
            {busy ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
          >
            Logout
          </Button>
        </div>
      </div>

      <GlassCard title="Controls" className="mb-5">
        <div className="grid gap-4 lg:grid-cols-6">
          <Field label="Authority lat">
            <input value={aLat} onChange={(e) => setALat(e.target.value)} />
          </Field>
          <Field label="Authority lng">
            <input value={aLng} onChange={(e) => setALng(e.target.value)} />
          </Field>
          <Field label="Nearby radius (m)">
            <input value={radiusM} onChange={(e) => setRadiusM(e.target.value)} />
          </Field>
          <Field label="Polling interval (sec)">
            <input value={pollSec} onChange={(e) => setPollSec(e.target.value)} />
          </Field>
          <Field label="Auto refresh">
            <select value={pollEnabled ? "ON" : "OFF"} onChange={(e) => setPollEnabled(e.target.value === "ON")}>
              <option value="ON">ON</option>
              <option value="OFF">OFF</option>
            </select>
          </Field>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => loadNearbyAlerts()}>
              Fetch Nearby
            </Button>
          </div>
        </div>
        {geoErr ? <div className="mt-2 text-xs text-warning">Location note: {geoErr}</div> : null}
      </GlassCard>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="grid gap-5">
          <AuthorityMap
            authorityLat={Number.isFinite(Number(aLat)) ? Number(aLat) : null}
            authorityLng={Number.isFinite(Number(aLng)) ? Number(aLng) : null}
            alerts={filteredAlerts}
            zones={zones}
            selectedAlertId={selectedAlertId}
            onSelectAlert={setSelectedAlertId}
          />

          <GlassCard title="Nearby alerts">
            <div className="mb-4 grid gap-3 md:grid-cols-5">
              <Field label="Search">
                <input
                  value={filters.query}
                  onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
                  placeholder="summary / user id"
                />
              </Field>
              <Field label="Type">
                <select
                  value={filters.type}
                  onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as any }))}
                >
                  <option value="ALL">ALL</option>
                  <option value="SOS">SOS</option>
                  <option value="GEOFENCE">GEOFENCE</option>
                  <option value="ANOMALY">ANOMALY</option>
                </select>
              </Field>
              <Field label="Min risk">
                <select
                  value={filters.minRiskLevel ?? ""}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      minRiskLevel: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">Any</option>
                  <option value="1">1+</option>
                  <option value="2">2+</option>
                  <option value="3">3+</option>
                  <option value="4">4+</option>
                  <option value="5">5</option>
                </select>
              </Field>
              <Field label="Max distance (m)">
                <input
                  value={filters.maxDistanceM ?? ""}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      maxDistanceM: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  placeholder="Any"
                />
              </Field>
              <Field label="Sort">
                <select
                  value={filters.sort}
                  onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as any }))}
                >
                  <option value="distance_asc">Distance (near first)</option>
                  <option value="distance_desc">Distance (far first)</option>
                  <option value="risk_desc">Risk (high first)</option>
                  <option value="time_desc">Newest first</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-3">
              {filteredAlerts.length === 0 ? (
                <div className="text-sm text-muted-foreground">No nearby alerts for current filters.</div>
              ) : (
                filteredAlerts.map((a) => (
                  <div
                    key={a.id}
                    className={`rounded-xl border p-3 ${
                      selectedAlertId === a.id ? "border-primary/40 bg-primary/5" : "border-border bg-card/30"
                    }`}
                    onClick={() => setSelectedAlertId(a.id)}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone={riskTone(a.risk_level || 1)}>{a.type}</Badge>
                      <Badge tone="neutral">{a.status}</Badge>
                      <Badge tone="info">{Math.round(a.distance_m || 0)}m</Badge>
                      <span className="ml-auto text-xs text-muted-foreground">{a.user_id}</span>
                    </div>
                    <div className="text-sm text-foreground/85">{a.summary || "No summary"}</div>
                    <InlineRow className="mt-3">
                      <Button
                        variant="secondary"
                        disabled={actionBusyId === a.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          ack(a.id).catch((err) => showToast("danger", "ACK failed", String(err)));
                        }}
                      >
                        {actionBusyId === a.id ? "Working…" : "ACK"}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={actionBusyId === a.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          resolve(a.id).catch((err) => showToast("danger", "Resolve failed", String(err)));
                        }}
                      >
                        {actionBusyId === a.id ? "Working…" : "Resolve"}
                      </Button>
                    </InlineRow>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </div>

        <div className="grid gap-5">
          <GlassCard title="Selected alert details">
            {selectedAlert ? (
              <>
                <Pre value={selectedAlert} />
                <InlineRow className="mt-3">
                  <Button variant="secondary" disabled={docBusy} onClick={() => viewLatestDocumentForSelectedAlert()}>
                    {docBusy ? "Opening…" : "View User Document"}
                  </Button>
                </InlineRow>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Select an alert from the list or map.</div>
            )}
          </GlassCard>

          <GlassCard title={editingZoneId ? "Edit circle zone" : "Create circle zone"}>
            <div className="grid gap-3">
              <Field label="Zone name">
                <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Risk level (1..5)">
                  <input value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} />
                </Field>
                <Field label="Radius (m)">
                  <input value={circleRadiusM} onChange={(e) => setCircleRadiusM(e.target.value)} />
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Center lat">
                  <input value={zLat} onChange={(e) => setZLat(e.target.value)} />
                </Field>
                <Field label="Center lng">
                  <input value={zLng} onChange={(e) => setZLng(e.target.value)} />
                </Field>
              </div>
              <InlineRow>
                <Button onClick={() => createOrUpdateCircleZone().catch((e) => showToast("danger", "Zone save failed", String(e)))}>
                  {editingZoneId ? "Update zone" : "Create zone"}
                </Button>
                {editingZoneId ? (
                  <Button variant="ghost" onClick={resetZoneForm}>
                    Cancel edit
                  </Button>
                ) : null}
              </InlineRow>
            </div>
          </GlassCard>

          <GlassCard title="Existing zones">
            <div className="grid gap-3">
              {zones.length === 0 ? (
                <div className="text-sm text-muted-foreground">No zones available.</div>
              ) : (
                zones
                  .filter((z) => z.shape_type === "CIRCLE")
                  .map((z) => (
                    <div key={z.id} className="glass-card rounded-xl p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">{z.name}</div>
                        <Badge tone={riskTone(z.risk_level || 1)}>Risk {z.risk_level}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Lat {z.circle_center_lat}, Lng {z.circle_center_lng}, Radius {Math.round(Number(z.circle_radius_m || 0))}m
                      </div>
                      <InlineRow className="mt-3">
                        <Button variant="secondary" onClick={() => beginEditZone(z)}>
                          Edit
                        </Button>
                        <Button variant="danger" onClick={() => setShowDeleteZone(z.id)}>
                          Delete
                        </Button>
                      </InlineRow>
                    </div>
                  ))
              )}
            </div>
          </GlassCard>

          <GlassCard title="Debug me">
            <Pre value={me} />
          </GlassCard>
        </div>
      </div>

      <Modal open={Boolean(showDeleteZone)} title="Delete zone?" onClose={() => setShowDeleteZone(null)}>
        <div className="grid gap-4 text-sm text-white/75">
          <p>This action removes the danger zone immediately.</p>
          <InlineRow>
            <Button
              variant="danger"
              onClick={() => showDeleteZone && deleteZone(showDeleteZone).catch((e) => showToast("danger", "Delete failed", String(e)))}
            >
              Delete zone
            </Button>
            <Button variant="ghost" onClick={() => setShowDeleteZone(null)}>
              Cancel
            </Button>
          </InlineRow>
        </div>
      </Modal>

      <Toast
        open={toastOpen}
        title={toastTitle}
        message={toastMessage}
        tone={toastTone}
        onClose={() => setToastOpen(false)}
      />
    </Container>
  );
}

