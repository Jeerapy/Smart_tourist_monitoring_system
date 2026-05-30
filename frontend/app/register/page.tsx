"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { convertDDMMYYYYToISO } from "../../lib/dob";
import { Badge, Button, Container, Divider, Field, GlassCard, InlineRow, Toast } from "../components/Ui";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";

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
    <div className="min-h-screen">
      <div className="grid min-h-screen lg:grid-cols-2">
        <div className="relative hidden overflow-hidden p-12 lg:flex lg:items-center lg:justify-center">
          <div className="absolute inset-0 gradient-hero" />
          <div className="hero-mesh" />
          <div className="particle-grid" />
          <div className="absolute left-1/3 top-1/3 h-72 w-72 rounded-full bg-primary/20 blur-[100px]" />
          <div className="absolute bottom-1/3 right-1/3 h-56 w-56 rounded-full bg-primary/15 blur-[80px]" />

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="relative mx-auto max-w-md text-center"
          >
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
              <div className="mx-auto mb-8 w-fit rounded-2xl border border-border/70 bg-card/25 p-5 backdrop-blur-xl">
                <div className="h-10 w-10 rounded-full bg-safe shadow-[0_0_22px_rgba(34,197,94,0.55)]" />
              </div>
            </motion.div>
            <h2 className="font-mono text-3xl font-bold text-foreground">Create Your Digital ID</h2>
            <p className="mt-4 text-foreground/60">Register once, then use SOS + verification anywhere.</p>
          </motion.div>
        </div>

        <div className="flex flex-col bg-background">
          <Container className="py-0">
            <div className="flex items-center justify-between py-6">
              <Link href="/" className="flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <span className="font-bold">STMS</span>
              </Link>
              <InlineRow className="gap-2">
                <Badge tone="info">Tourist</Badge>
                <Badge tone="neutral">Role: user</Badge>
              </InlineRow>
            </div>

            <div className="flex flex-1 items-center justify-center pb-12">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-xl"
              >
                <h1 className="font-mono text-3xl font-bold">Create Tourist Digital ID</h1>
                <p className="mt-2 text-muted-foreground">
                  Complete registration for geofence safety, SOS escalation, and verification.
                </p>

                <div className="mt-8">
                  <GlassCard title={undefined} className="p-0">
                    <div className="p-6">
                      <div className="grid gap-6">
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Full Name*">
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                              <input
                                className="input-premium"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="John Doe"
                              />
                            </div>
                          </Field>
                          <Field label="Email ID*">
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                              <input
                                className="input-premium"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                type="email"
                                placeholder="tourist@example.com"
                              />
                            </div>
                          </Field>
                        </div>

                        <Divider />

                        <div className="text-sm font-semibold text-foreground">Citizen Information</div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Citizenship*">
                            <select value={citizenship} onChange={(e) => setCitizenship(e.target.value as any)}>
                              <option value="INDIAN">Indian Citizen</option>
                              <option value="FOREIGN">Foreign Citizen</option>
                            </select>
                          </Field>

                          {citizenship === "INDIAN" ? (
                            <Field label="Aadhaar Card Number*">
                              <div className="relative">
                                <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                                <input
                                  className="input-premium"
                                  value={aadhaarNumber}
                                  onChange={(e) => setAadhaarNumber(e.target.value)}
                                  placeholder="1234 5678 9012"
                                />
                              </div>
                            </Field>
                          ) : (
                            <Field label="Passport Number*">
                              <div className="relative">
                                <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                                <input
                                  className="input-premium"
                                  value={passportNumber}
                                  onChange={(e) => setPassportNumber(e.target.value)}
                                  placeholder="Passport ID"
                                />
                              </div>
                            </Field>
                          )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Phone Number*">
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                              <input
                                className="input-premium"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                placeholder="+91 98765 43210"
                              />
                            </div>
                          </Field>
                          <Field label="Alternative Phone Number">
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                              <input
                                className="input-premium"
                                value={alternativePhoneNumber}
                                onChange={(e) => setAlternativePhoneNumber(e.target.value)}
                                placeholder="+91 98765 43211"
                              />
                            </div>
                          </Field>
                        </div>

                        <Divider />

                        <div className="text-sm font-semibold text-foreground">Emergency Contact Details</div>
                        <div className="grid gap-4 md:grid-cols-3">
                          <Field label="Contact Name*">
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                              <input
                                className="input-premium"
                                value={emergencyContactName}
                                onChange={(e) => setEmergencyContactName(e.target.value)}
                                placeholder="Jane Doe"
                              />
                            </div>
                          </Field>
                          <Field label="Contact Phone*">
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                              <input
                                className="input-premium"
                                value={emergencyContactPhone}
                                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                                placeholder="+91 98765 43210"
                              />
                            </div>
                          </Field>
                          <Field label="Relation*">
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                              <input
                                className="input-premium"
                                value={emergencyContactRelation}
                                onChange={(e) => setEmergencyContactRelation(e.target.value)}
                                placeholder="Spouse / Parent / Friend"
                              />
                            </div>
                          </Field>
                        </div>

                        <Divider />

                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Date of Birth*">
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                              <input
                                className="input-premium"
                                value={dob}
                                onChange={(e) => setDob(e.target.value)}
                                placeholder="DD-MM-YYYY"
                              />
                            </div>
                          </Field>
                          <Field label="Place (optional)">
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                              <input
                                className="input-premium"
                                value={place}
                                onChange={(e) => setPlace(e.target.value)}
                                placeholder="City / State"
                              />
                            </div>
                          </Field>
                        </div>

                        <Field label="Password*">
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                            <input
                              className="input-premium pr-10"
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Create a password"
                            />
                          </div>
                        </Field>

                        <Divider />

                        <div className="grid gap-3 rounded-xl border border-border bg-card/30 p-4">
                          <div className="text-sm font-semibold text-foreground">Consent & Permissions</div>

                          <label className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={consentLocationTracking}
                              onChange={(e) => setConsentLocationTracking(e.target.checked)}
                              style={{ marginTop: 3 }}
                            />
                            <div className="text-sm text-muted-foreground">
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
                            <div className="text-sm text-muted-foreground">
                              I consent to storing my verification credentials on blockchain/IPFS for secure verification and data protection.
                            </div>
                          </label>
                        </div>

                        <InlineRow className="pt-2">
                          <Button
                            disabled={busy || !consentLocationTracking || !consentBlockchainStorage}
                            onClick={onRegister}
                            className="w-full py-3"
                          >
                            {busy ? "Creating…" : "Create Tourist Digital ID"}
                          </Button>
                          <Link href="/login">
                            <Button variant="ghost">Login</Button>
                          </Link>
                        </InlineRow>

                        <div className="text-xs text-muted-foreground">
                          Authorities?{" "}
                          <Link className="font-semibold text-primary hover:underline" href="/authority/register">
                            Register as Authority
                          </Link>
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </motion.div>
            </div>
          </Container>
        </div>
      </div>

      <Toast open={toastOpen} title={toastTitle} message={toastMessage} tone={toastTone} onClose={() => setToastOpen(false)} />
    </div>
  );
}

