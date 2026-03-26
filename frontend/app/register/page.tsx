"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { convertDDMMYYYYToISO } from "../../lib/dob";
import { Badge, Button, Container, Divider, Field, GlassCard, InlineRow, Toast } from "../components/Ui";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dob, setDob] = useState(""); // DD-MM-YYYY (required for backend verification)
  const [place, setPlace] = useState(""); // optional (kept for compatibility with existing schema)

  const [citizenship, setCitizenship] = useState<"INDIAN" | "FOREIGN">("INDIAN");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [passportNumber, setPassportNumber] = useState("");

  const [phoneNumber, setPhoneNumber] = useState("");
  const [alternativePhoneNumber, setAlternativePhoneNumber] = useState("");

  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [emergencyContactRelation, setEmergencyContactRelation] = useState("");

  const [consentLocationTracking, setConsentLocationTracking] = useState(false);
  const [consentBlockchainStorage, setConsentBlockchainStorage] = useState(false);

  const [busy, setBusy] = useState(false);
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

  async function onRegister() {
    setBusy(true);
    try {
      if (!consentLocationTracking || !consentBlockchainStorage) {
        showToast(
          "warning",
          "Consent required",
          "Please accept both permissions to complete registration."
        );
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error("No user id returned from signUp");

      // RLS requires an authenticated session token to insert into `profiles`.
      // If email confirmation is enabled, signUp may NOT create a session.
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) {
          showToast(
            "warning",
            "Confirm email",
            "Account created but no session yet. If email confirmation is enabled, confirm your email, then login."
          );
          return;
        }
        sessionData = { session: signInData.session };
      }

      const dobIso = convertDDMMYYYYToISO(dob);
      if (!dobIso) {
        showToast("warning", "Invalid DOB", "Please enter DOB as DD-MM-YYYY.");
        return;
      }

      const { error: insertErr } = await supabase.from("profiles").insert({
        id: userId,
        role: "user",
        full_name: fullName,
        dob: dobIso,
        place: place || null,
        citizenship,
        aadhaar_number: citizenship === "INDIAN" ? aadhaarNumber : null,
        passport_number: citizenship === "FOREIGN" ? passportNumber : null,
        phone_number: phoneNumber || null,
        alternative_phone_number: alternativePhoneNumber || null,
        emergency_contact_name: emergencyContactName || null,
        emergency_contact_phone: emergencyContactPhone || null,
        emergency_contact_relation: emergencyContactRelation || null,
        consent_location_tracking: consentLocationTracking,
        consent_blockchain_storage: consentBlockchainStorage,
      });
      if (insertErr) throw insertErr;

      showToast("success", "Registered", "Account created. Please login.");
      router.push("/login");
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      showToast("danger", "Registration failed", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="pt-12">
      <div className="mx-auto w-full max-w-xl">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 2 20 6v6c0 5-3.4 9.3-8 10-4.6-.7-8-5-8-10V6l8-4Z"
                stroke="rgba(34,197,94,0.95)"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M8.5 12.2 10.7 14.4 15.6 9.5"
                stroke="rgba(34,197,94,0.95)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="mb-3 flex items-center justify-center gap-2">
            <Badge tone="info">Tourist</Badge>
            <Badge tone="neutral">Role: user</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white/95">Create Tourist Digital ID</h1>
          <p className="mt-2 text-sm text-white/65">
            Complete registration for geofence safety, SOS escalation, and document verification.
          </p>
        </div>

        <GlassCard className="mt-7" title={undefined}>
          <div className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={`Full Name*`}>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                />
              </Field>
              <Field label={`Email ID*`}>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="tourist@example.com"
                />
              </Field>
            </div>

            <Divider />

            <div className="text-sm font-semibold text-white/90">Citizen Information</div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Citizenship*">
                <select value={citizenship} onChange={(e) => setCitizenship(e.target.value as any)}>
                  <option value="INDIAN">Indian Citizen</option>
                  <option value="FOREIGN">Foreign Citizen</option>
                </select>
              </Field>

              {citizenship === "INDIAN" ? (
                <Field label="Aadhaar Card Number*">
                  <input
                    value={aadhaarNumber}
                    onChange={(e) => setAadhaarNumber(e.target.value)}
                    placeholder="1234 5678 9012"
                  />
                </Field>
              ) : (
                <Field label="Passport Number*">
                  <input
                    value={passportNumber}
                    onChange={(e) => setPassportNumber(e.target.value)}
                    placeholder="Passport ID"
                  />
                </Field>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Phone Number*">
                <input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </Field>
              <Field label="Alternative Phone Number">
                <input
                  value={alternativePhoneNumber}
                  onChange={(e) => setAlternativePhoneNumber(e.target.value)}
                  placeholder="+91 98765 43211"
                />
              </Field>
            </div>

            <Divider />

            <div className="text-sm font-semibold text-white/90">Emergency Contact Details</div>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Contact Name*">
                <input
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </Field>
              <Field label="Contact Phone*">
                <input
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </Field>
              <Field label="Relation*">
                <input
                  value={emergencyContactRelation}
                  onChange={(e) => setEmergencyContactRelation(e.target.value)}
                  placeholder="Spouse / Parent / Friend"
                />
              </Field>
            </div>

            <Divider />

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Date of Birth*">
                <input value={dob} onChange={(e) => setDob(e.target.value)} placeholder="DD-MM-YYYY" />
              </Field>
              <Field label="Place (optional)">
                <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="City / State" />
              </Field>
            </div>

            <Field label="Password*">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
              />
            </Field>

            <Divider />

            <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold text-white/90">Consent & Permissions</div>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={consentLocationTracking}
                  onChange={(e) => setConsentLocationTracking(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <div className="text-sm text-white/70">
                  I consent to real-time location tracking for safety and emergency response purposes.
                </div>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={consentBlockchainStorage}
                  onChange={(e) => setConsentBlockchainStorage(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <div className="text-sm text-white/70">
                  I consent to storing my verification credentials on blockchain/IPFS for secure verification and
                  data protection.
                </div>
              </label>
            </div>

            <InlineRow className="pt-2">
              <Button disabled={busy || !consentLocationTracking || !consentBlockchainStorage} onClick={onRegister}>
                {busy ? "Creating…" : "Create Tourist Digital ID"}
              </Button>
              <Link href="/login" className="ml-auto">
                <Button variant="ghost">Login</Button>
              </Link>
            </InlineRow>

            <div className="text-xs text-white/60">
              Authorities?{" "}
              <Link className="text-cyan-200 hover:text-cyan-100" href="/authority/register">
                Register as Authority
              </Link>
            </div>
          </div>
        </GlassCard>
      </div>

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

