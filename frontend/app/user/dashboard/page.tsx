"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { backendFetch } from "../../../lib/backend";
import { Button, Card, Container, Field, InlineRow, Pre } from "../../components/Ui";

export default function UserDashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [verification, setVerification] = useState<any>(null);
  const [alerts, setAlerts] = useState<any>(null);
  const [pingRes, setPingRes] = useState<any>(null);
  const [sosRes, setSosRes] = useState<any>(null);
  const [uploadRes, setUploadRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const [lat, setLat] = useState("12.9716");
  const [lng, setLng] = useState("77.5946");
  const [docType, setDocType] = useState("OTHER");
  const [file, setFile] = useState<File | null>(null);
  const [verifyName, setVerifyName] = useState("");
  const [verifyDob, setVerifyDob] = useState("");

  async function loadAll() {
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      if (!uid) throw new Error("Not logged in");

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .maybeSingle();
      if (profErr) throw profErr;
      setProfile(prof);

      const ver = await backendFetch("/me/verification");
      setVerification(ver);

      const myAlerts = await backendFetch("/me/alerts");
      setAlerts(myAlerts);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAll().catch((e) => setVerification({ error: String(e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendPing() {
    setPingRes(null);
    const payload = {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      recorded_at: new Date().toISOString(),
      accuracy_m: 10,
      heading_deg: 0,
      altitude_m: null,
      speed_mps: null,
    };
    const res = await backendFetch("/location/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPingRes(res);
  }

  async function sendSos() {
    setSosRes(null);
    const payload = { lat: parseFloat(lat), lng: parseFloat(lng) };
    const res = await backendFetch("/alerts/sos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSosRes(res);
  }

  async function uploadDoc() {
    if (!file) throw new Error("Pick a file first");
    setUploadRes(null);
    const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    form.append("full_name", verifyName);
    form.append("dob", verifyDob);

    const res = await fetch(`${baseUrl}/public/verification/upload-document`, {
      method: "POST",
      body: form,
    });
    const text = await res.text();
    let dataJson: any = text;
    try {
      dataJson = JSON.parse(text);
    } catch {}
    if (!res.ok) throw new Error(`Upload failed ${res.status}: ${text}`);
    setUploadRes(dataJson);
    await loadAll();
  }

  return (
    <Container>
      <h2>User dashboard</h2>
      <p>Shows Supabase profile + backend verification + lets you test ping/SOS/OCR upload.</p>

      <Card title="Actions">
        <InlineRow>
          <Button disabled={busy} onClick={() => loadAll()}>
            Refresh
          </Button>
          <Button onClick={async () => supabase.auth.signOut()}>Logout</Button>
        </InlineRow>
      </Card>

      <Card title="Profile (Supabase DB)">
        <Pre value={profile} />
      </Card>

      <Card title="Verification status (Backend + Supabase)">
        <Pre value={verification} />
      </Card>

      <Card title="Upload document (OCR + cross-verify)">
        <Field label="Document type">
          <input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="PASSPORT/AADHAAR/OTHER" />
        </Field>
        <Field label="Name to verify against (for simple mode)">
          <input value={verifyName} onChange={(e) => setVerifyName(e.target.value)} placeholder="Your full name" />
        </Field>
        <Field label="DOB to verify against (YYYY-MM-DD)">
          <input value={verifyDob} onChange={(e) => setVerifyDob(e.target.value)} placeholder="2003-01-31" />
        </Field>
        <Field label="File (PDF/JPG/PNG)">
          <input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </Field>
        <Button onClick={uploadDoc}>Upload & Verify</Button>
        {uploadRes && <Pre value={uploadRes} />}
      </Card>

      <Card title="Location ping">
        <InlineRow>
          <Field label="lat">
            <input value={lat} onChange={(e) => setLat(e.target.value)} />
          </Field>
          <Field label="lng">
            <input value={lng} onChange={(e) => setLng(e.target.value)} />
          </Field>
        </InlineRow>
        <Button onClick={sendPing}>Send ping</Button>
        {pingRes && <Pre value={pingRes} />}
      </Card>

      <Card title="SOS">
        <Button onClick={sendSos}>Trigger SOS</Button>
        {sosRes && <Pre value={sosRes} />}
      </Card>

      <Card title="My alerts (Backend)">
        <Pre value={alerts} />
      </Card>
    </Container>
  );
}

