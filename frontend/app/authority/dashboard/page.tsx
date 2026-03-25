"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { backendFetch } from "../../../lib/backend";
import { Button, Card, Container, Field, InlineRow, Pre } from "../../components/Ui";

export default function AuthorityDashboard() {
  const [me, setMe] = useState<any>(null);
  const [zones, setZones] = useState<any>(null);
  const [nearby, setNearby] = useState<any>(null);
  const [createRes, setCreateRes] = useState<any>(null);
  const [actionRes, setActionRes] = useState<any>(null);

  const [zoneName, setZoneName] = useState("Test Circle Zone");
  const [riskLevel, setRiskLevel] = useState("4");
  const [zLat, setZLat] = useState("12.9716");
  const [zLng, setZLng] = useState("77.5946");
  const [radiusM, setRadiusM] = useState("500");

  const [aLat, setALat] = useState("12.9716");
  const [aLng, setALng] = useState("77.5946");
  const [aRadius, setARadius] = useState("5000");

  async function loadAll() {
    const m = await backendFetch("/me");
    setMe(m);
    const z = await backendFetch("/zones");
    setZones(z);
  }

  useEffect(() => {
    loadAll().catch((e) => setMe({ error: String(e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createCircleZone() {
    setCreateRes(null);
    const payload = {
      name: zoneName,
      risk_level: parseInt(riskLevel, 10),
      shape_type: "CIRCLE",
      circle_center_lat: parseFloat(zLat),
      circle_center_lng: parseFloat(zLng),
      circle_radius_m: parseFloat(radiusM),
    };
    const res = await backendFetch("/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setCreateRes(res);
    await loadAll();
  }

  async function getNearby() {
    const res = await backendFetch(
      `/authority/alerts/nearby?lat=${encodeURIComponent(aLat)}&lng=${encodeURIComponent(aLng)}&radius_m=${encodeURIComponent(aRadius)}`
    );
    setNearby(res);
  }

  async function ack(alertId: string) {
    const res = await backendFetch(`/authority/alerts/${alertId}/ack`, { method: "POST" });
    setActionRes(res);
    await getNearby();
  }

  async function resolve(alertId: string) {
    const res = await backendFetch(`/authority/alerts/${alertId}/resolve`, { method: "POST" });
    setActionRes(res);
    await getNearby();
  }

  return (
    <Container>
      <h2>Authority dashboard</h2>
      <p>Create zones and view/act on nearby OPEN alerts.</p>

      <Card title="Actions">
        <InlineRow>
          <Button onClick={() => loadAll()}>Refresh</Button>
          <Button onClick={async () => supabase.auth.signOut()}>Logout</Button>
        </InlineRow>
      </Card>

      <Card title="Me (Backend)">
        <Pre value={me} />
      </Card>

      <Card title="Create circle danger zone">
        <Field label="Name">
          <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
        </Field>
        <InlineRow>
          <Field label="Risk level">
            <input value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} />
          </Field>
          <Field label="Center lat">
            <input value={zLat} onChange={(e) => setZLat(e.target.value)} />
          </Field>
          <Field label="Center lng">
            <input value={zLng} onChange={(e) => setZLng(e.target.value)} />
          </Field>
          <Field label="Radius (m)">
            <input value={radiusM} onChange={(e) => setRadiusM(e.target.value)} />
          </Field>
        </InlineRow>
        <Button onClick={createCircleZone}>Create zone</Button>
        {createRes && <Pre value={createRes} />}
      </Card>

      <Card title="Zones (Backend)">
        <Pre value={zones} />
      </Card>

      <Card title="Nearby OPEN alerts">
        <InlineRow>
          <Field label="Authority lat">
            <input value={aLat} onChange={(e) => setALat(e.target.value)} />
          </Field>
          <Field label="Authority lng">
            <input value={aLng} onChange={(e) => setALng(e.target.value)} />
          </Field>
          <Field label="Radius (m)">
            <input value={aRadius} onChange={(e) => setARadius(e.target.value)} />
          </Field>
        </InlineRow>
        <Button onClick={getNearby}>Fetch nearby alerts</Button>
        {nearby && (
          <>
            <Pre value={nearby} />
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {(nearby.alerts || []).slice(0, 10).map((a: any) => (
                <div key={a.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 700 }}>
                    {a.type} — {a.status} — {Math.round(a.distance_m)}m
                  </div>
                  <div style={{ fontSize: 12, color: "#444" }}>{a.summary}</div>
                  <InlineRow>
                    <Button onClick={() => ack(a.id)}>ACK</Button>
                    <Button onClick={() => resolve(a.id)}>RESOLVE</Button>
                  </InlineRow>
                </div>
              ))}
            </div>
          </>
        )}
        {actionRes && (
          <Card title="Last action result">
            <Pre value={actionRes} />
          </Card>
        )}
      </Card>
    </Container>
  );
}

