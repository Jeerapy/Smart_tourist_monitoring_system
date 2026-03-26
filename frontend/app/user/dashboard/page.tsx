"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { backendFetch, backendUploadForm } from "../../../lib/backend";
import { MapView } from "../../components/MapView";
import { Badge, Button, Container, Divider, Field, GlassCard, InlineRow, Modal, Pre, Toast } from "../../components/Ui";
import { convertDDMMYYYYToISO, formatISOToDDMMYYYY } from "../../../lib/dob";

export default function UserDashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [verification, setVerification] = useState<any>(null);
  const [alerts, setAlerts] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  const [pingStatus, setPingStatus] = useState<any>(null);
  const [pinging, setPinging] = useState(false);
  const lastPingAtRef = useRef<number>(0);
  const lastSentAtRef = useRef<number>(0);

  const [sosOpen, setSosOpen] = useState(false);
  const [sosBusy, setSosBusy] = useState(false);
  const [sosRes, setSosRes] = useState<any>(null);

  const [profileEdit, setProfileEdit] = useState({
    full_name: "",
    dob: "",
    place: "",
    citizenship: "INDIAN" as "INDIAN" | "FOREIGN",
    aadhaar_number: "",
    passport_number: "",
    phone_number: "",
    alternative_phone_number: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    emergency_contact_relation: "",
    consent_location_tracking: false,
    consent_blockchain_storage: false,
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [docType, setDocType] = useState("OTHER");
  const [file, setFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadRes, setUploadRes] = useState<any>(null);

  const [toastOpen, setToastOpen] = useState(false);
  const [toastTone, setToastTone] = useState<"info" | "success" | "warning" | "danger">("info");
  const [toastTitle, setToastTitle] = useState(" ");
  const [toastMessage, setToastMessage] = useState<string | undefined>(undefined);

  function showToast(tone: "info" | "success" | "warning" | "danger", title: string, message?: string) {
    setToastTone(tone);
    setToastTitle(title);
    setToastMessage(message);
    setToastOpen(true);
  }

  const isVerified = useMemo(() => Boolean(verification?.is_verified), [verification]);

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
      setProfileEdit({
        full_name: prof?.full_name || "",
        dob: formatISOToDDMMYYYY(prof?.dob),
        place: prof?.place || "",
        citizenship: (prof?.citizenship || "INDIAN") as "INDIAN" | "FOREIGN",
        aadhaar_number: prof?.aadhaar_number || "",
        passport_number: prof?.passport_number || "",
        phone_number: prof?.phone_number || "",
        alternative_phone_number: prof?.alternative_phone_number || "",
        emergency_contact_name: prof?.emergency_contact_name || "",
        emergency_contact_phone: prof?.emergency_contact_phone || "",
        emergency_contact_relation: prof?.emergency_contact_relation || "",
        consent_location_tracking: Boolean(prof?.consent_location_tracking),
        consent_blockchain_storage: Boolean(prof?.consent_blockchain_storage),
      });

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

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeoErr("Geolocation is not supported in this browser.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoErr(null);
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
      },
      (err) => {
        setGeoErr(err.message || "Failed to get location.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  async function sendPingIfDue(force = false) {
    if (pinging) return;
    if (typeof userLat !== "number" || typeof userLng !== "number") return;

    const now = Date.now();
    const minGapMs = 15000;
    if (!force && now - lastSentAtRef.current < minGapMs) return;

    setPinging(true);
    lastSentAtRef.current = now;
    try {
      const payload = {
        lat: userLat,
        lng: userLng,
        recorded_at: new Date().toISOString(),
        accuracy_m: null,
        heading_deg: null,
        altitude_m: null,
        speed_mps: null,
      };
      const res = await backendFetch<any>("/location/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      lastPingAtRef.current = now;
      setPingStatus(res);

      const created = Boolean(res?.geofence?.alert_created);
      const hit = Boolean(res?.geofence?.hit);
      if (created) {
        showToast("warning", "Geofence alert created", "Authorities have been notified about zone entry.");
        const myAlerts = await backendFetch("/me/alerts");
        setAlerts(myAlerts);
      } else if (hit) {
        showToast("info", "In a monitored zone", "Stay alert. Move away if this is a danger zone.");
      }
    } catch (e: any) {
      showToast("danger", "Location ping failed", e?.message ?? String(e));
    } finally {
      setPinging(false);
    }
  }

  useEffect(() => {
    const t = setInterval(() => {
      sendPingIfDue(false).catch(() => {});
    }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLat, userLng, pinging]);

  async function sendSosAlert() {
    if (sosBusy) return;
    setSosBusy(true);
    setSosRes(null);
    try {
      const payload = {
        lat: typeof userLat === "number" ? userLat : null,
        lng: typeof userLng === "number" ? userLng : null,
        summary: "Emergency SOS triggered (user app)",
      };
      const res = await backendFetch("/alerts/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSosRes(res);
      showToast("success", "SOS sent", "Alert sent to authorities.");
      const myAlerts = await backendFetch("/me/alerts");
      setAlerts(myAlerts);
      setSosOpen(false);
    } catch (e: any) {
      showToast("danger", "SOS failed", e?.message ?? String(e));
    } finally {
      setSosBusy(false);
    }
  }

  function callEmergency() {
    // India emergency number (police): 100
    window.location.href = "tel:100";
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      if (!uid) throw new Error("Not logged in");

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profileEdit.full_name || null,
          dob: convertDDMMYYYYToISO(profileEdit.dob) || null,
          place: profileEdit.place || null,
          citizenship: profileEdit.citizenship,
          aadhaar_number: profileEdit.citizenship === "INDIAN" ? profileEdit.aadhaar_number || null : null,
          passport_number: profileEdit.citizenship === "FOREIGN" ? profileEdit.passport_number || null : null,
          phone_number: profileEdit.phone_number || null,
          alternative_phone_number: profileEdit.alternative_phone_number || null,
          emergency_contact_name: profileEdit.emergency_contact_name || null,
          emergency_contact_phone: profileEdit.emergency_contact_phone || null,
          emergency_contact_relation: profileEdit.emergency_contact_relation || null,
          consent_location_tracking: profileEdit.consent_location_tracking,
          consent_blockchain_storage: profileEdit.consent_blockchain_storage,
        })
        .eq("id", uid);
      if (error) throw error;

      showToast("success", "Profile updated");
      await loadAll();
    } catch (e: any) {
      showToast("danger", "Profile update failed", e?.message ?? String(e));
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadDoc() {
    if (!file) {
      showToast("warning", "Pick a document", "Choose a PDF/JPG/PNG first.");
      return;
    }
    setUploadBusy(true);
    setUploadRes(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("doc_type", docType);

      const res = await backendUploadForm("/verification/upload-document", form);
      setUploadRes(res);
      showToast("success", "Uploaded", "Document uploaded for verification.");
      await loadAll();
    } catch (e: any) {
      showToast("danger", "Upload failed", e?.message ?? String(e));
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <Container className="pt-10">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white/95">User dashboard</h1>
          <div className="mt-1 text-sm text-white/60">
            Live safety view: location + geofences + SOS + verification.
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}
          {geoErr ? <Badge tone="danger">Location off</Badge> : <Badge tone="info">Location on</Badge>}
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

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="grid gap-5">
          <GlassCard
            title="Emergency"
            right={
              <Badge tone="danger">
                <span className="text-red-100/90">SOS</span>
              </Badge>
            }
          >
            <div className="grid gap-3">
              <Button variant="danger" className="w-full py-3 text-base" onClick={() => setSosOpen(true)}>
                SOS
              </Button>
              <div className="text-xs text-white/65">
                Use SOS only in real emergencies. Sending SOS creates an alert for authorities. Calling opens your phone
                dialer (India: 100).
              </div>
            </div>
          </GlassCard>

          <GlassCard
            title="Live status"
            right={
              <InlineRow>
                <Badge tone={pinging ? "warning" : "neutral"}>{pinging ? "Pinging…" : "Idle"}</Badge>
              </InlineRow>
            }
          >
            <div className="grid gap-3 text-sm text-white/75">
              <div className="flex items-center justify-between">
                <span className="text-white/60">Latitude</span>
                <span className="font-mono">{typeof userLat === "number" ? userLat.toFixed(6) : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60">Longitude</span>
                <span className="font-mono">{typeof userLng === "number" ? userLng.toFixed(6) : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60">Last ping</span>
                <span className="font-mono">
                  {lastPingAtRef.current ? new Date(lastPingAtRef.current).toLocaleTimeString() : "—"}
                </span>
              </div>
              {geoErr ? <div className="text-xs text-red-200/85">{geoErr}</div> : null}
              <InlineRow className="pt-1">
                <Button variant="secondary" disabled={pinging} onClick={() => sendPingIfDue(true)}>
                  {pinging ? "Sending…" : "Ping now"}
                </Button>
                <Button variant="ghost" onClick={() => setPingStatus(null)}>
                  Clear
                </Button>
              </InlineRow>
            </div>
          </GlassCard>

          <GlassCard title="Profile">
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Full name" hint="Should match your uploaded document for verification.">
                  <input
                    value={profileEdit.full_name}
                    onChange={(e) => setProfileEdit((p) => ({ ...p, full_name: e.target.value }))}
                    placeholder="Full name"
                  />
                </Field>
                <Field label="DOB (DD-MM-YYYY)">
                  <input
                    value={profileEdit.dob}
                    onChange={(e) => setProfileEdit((p) => ({ ...p, dob: e.target.value }))}
                    placeholder="31-12-2003"
                  />
                </Field>
              </div>

              <Field label="Place (optional)">
                <input
                  value={profileEdit.place}
                  onChange={(e) => setProfileEdit((p) => ({ ...p, place: e.target.value }))}
                  placeholder="City / State"
                />
              </Field>

              <Divider className="my-2" />

              <div className="text-sm font-semibold text-white/80">Citizen & ID</div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Citizenship">
                  <select
                    value={profileEdit.citizenship}
                    onChange={(e) => setProfileEdit((p) => ({ ...p, citizenship: e.target.value as any }))}
                  >
                    <option value="INDIAN">Indian Citizen</option>
                    <option value="FOREIGN">Foreign Citizen</option>
                  </select>
                </Field>

                {profileEdit.citizenship === "INDIAN" ? (
                  <Field label="Aadhaar Card Number">
                    <input
                      value={profileEdit.aadhaar_number}
                      onChange={(e) => setProfileEdit((p) => ({ ...p, aadhaar_number: e.target.value }))}
                      placeholder="1234 5678 9012"
                    />
                  </Field>
                ) : (
                  <Field label="Passport Number">
                    <input
                      value={profileEdit.passport_number}
                      onChange={(e) => setProfileEdit((p) => ({ ...p, passport_number: e.target.value }))}
                      placeholder="Passport ID"
                    />
                  </Field>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Phone Number">
                  <input
                    value={profileEdit.phone_number}
                    onChange={(e) => setProfileEdit((p) => ({ ...p, phone_number: e.target.value }))}
                    placeholder="+91 98765 43210"
                  />
                </Field>
                <Field label="Alternative Phone Number">
                  <input
                    value={profileEdit.alternative_phone_number}
                    onChange={(e) => setProfileEdit((p) => ({ ...p, alternative_phone_number: e.target.value }))}
                    placeholder="+91 98765 43211"
                  />
                </Field>
              </div>

              <Divider className="my-2" />

              <div className="text-sm font-semibold text-white/80">Emergency Contact</div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Name">
                  <input
                    value={profileEdit.emergency_contact_name}
                    onChange={(e) => setProfileEdit((p) => ({ ...p, emergency_contact_name: e.target.value }))}
                    placeholder="Jane Doe"
                  />
                </Field>
                <Field label="Phone">
                  <input
                    value={profileEdit.emergency_contact_phone}
                    onChange={(e) => setProfileEdit((p) => ({ ...p, emergency_contact_phone: e.target.value }))}
                    placeholder="+91 98765 43210"
                  />
                </Field>
                <Field label="Relation">
                  <input
                    value={profileEdit.emergency_contact_relation}
                    onChange={(e) => setProfileEdit((p) => ({ ...p, emergency_contact_relation: e.target.value }))}
                    placeholder="Spouse / Parent / Friend"
                  />
                </Field>
              </div>

              <Divider className="my-2" />

              <div className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white/90">Consent & Permissions</div>

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={profileEdit.consent_location_tracking}
                    onChange={(e) => setProfileEdit((p) => ({ ...p, consent_location_tracking: e.target.checked }))}
                    style={{ marginTop: 3 }}
                  />
                  <div className="text-sm text-white/70">
                    Location tracking for safety and emergency response purposes.
                  </div>
                </label>

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={profileEdit.consent_blockchain_storage}
                    onChange={(e) => setProfileEdit((p) => ({ ...p, consent_blockchain_storage: e.target.checked }))}
                    style={{ marginTop: 3 }}
                  />
                  <div className="text-sm text-white/70">
                    Storing verification credentials on blockchain/IPFS for secure verification and data protection.
                  </div>
                </label>
              </div>

              <InlineRow className="pt-1">
                <Button disabled={savingProfile} onClick={saveProfile}>
                  {savingProfile ? "Saving…" : "Save profile"}
                </Button>
                <Link href="/register" className="ml-auto">
                  <Button variant="ghost">Account page</Button>
                </Link>
              </InlineRow>
            </div>
          </GlassCard>

          <GlassCard title="Documents & verification">
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-white/75">
                  Status: {isVerified ? <span className="text-emerald-200">Verified</span> : <span className="text-amber-200">Not verified</span>}
                </div>
                <Button variant="secondary" disabled={busy} onClick={() => loadAll()}>
                  Refresh status
                </Button>
              </div>

              <Divider className="my-2" />

              <Field label="Document type">
                <input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="AADHAAR/PASSPORT/OTHER" />
              </Field>
              <Field label="File (PDF/JPG/PNG)">
                <input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </Field>
              <InlineRow>
                <Button disabled={uploadBusy} onClick={uploadDoc}>
                  {uploadBusy ? "Uploading…" : "Upload & verify"}
                </Button>
                <Button variant="ghost" onClick={() => setUploadRes(null)}>
                  Clear
                </Button>
              </InlineRow>
              {uploadRes ? <Pre value={uploadRes} /> : null}
            </div>
          </GlassCard>
        </div>

        <div className="grid gap-5">
          <MapView userLat={userLat} userLng={userLng} />

          <GlassCard title="Geofence response (last ping)">
            {pingStatus ? <Pre value={pingStatus} /> : <div className="text-sm text-white/60">No ping yet.</div>}
          </GlassCard>

          <GlassCard title="My alerts">
            {alerts ? <Pre value={alerts} /> : <div className="text-sm text-white/60">No alerts loaded yet.</div>}
          </GlassCard>

          <GlassCard title="Verification (backend)">
            {verification ? <Pre value={verification} /> : <div className="text-sm text-white/60">Loading…</div>}
          </GlassCard>
        </div>
      </div>

      <Modal open={sosOpen} title="Emergency SOS" onClose={() => setSosOpen(false)}>
        <div className="grid gap-4 text-sm text-white/75">
          <p>
            Choose an action. <span className="text-white/90">Send alert</span> will create a SOS alert for authorities.
          </p>
          <InlineRow>
            <Button variant="danger" disabled={sosBusy} onClick={sendSosAlert}>
              {sosBusy ? "Sending…" : "Send alert"}
            </Button>
            <Button variant="secondary" onClick={callEmergency}>
              Call emergency (100)
            </Button>
            <Button variant="ghost" onClick={() => setSosOpen(false)}>
              Cancel
            </Button>
          </InlineRow>
          {sosRes ? <Pre value={sosRes} /> : null}
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

