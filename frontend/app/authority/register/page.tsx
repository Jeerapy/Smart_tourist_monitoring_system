"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { Badge, Button, Container, GlassCard, InlineRow, Pre, Toast } from "../../components/Ui";

export default function AuthorityRegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<any>(null);
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
    setResult(null);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error("No user id returned from signUp");

      // If email confirmation is enabled, signUp may NOT create a session.
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) {
          setResult({
            ok: true,
            userId,
            message:
              "Account created, but no session yet (email confirmation may be required). Confirm email, then login.",
          });
          showToast("warning", "Confirm email", "If confirmation is enabled, check inbox then login.");
          return;
        }
        sessionData = { session: signInData.session };
      }

      const { error: insertErr } = await supabase.from("profiles").insert({
        id: userId,
        role: "authority",
      });
      if (insertErr) throw insertErr;

      setResult({ ok: true, userId, message: "Registered (authority). Please login." });
      showToast("success", "Registered", "Authority account created. Please login.");
      router.push("/login");
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setResult({ ok: false, error: msg, raw: e });
      showToast("danger", "Registration failed", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="pt-12">
      <div className="mx-auto grid w-full max-w-xl gap-5">
        <div className="text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <Badge tone="warning">Authorities</Badge>
            <Badge tone="neutral">Role: authority</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white/95">Authority register</h1>
          <p className="mt-2 text-sm text-white/65">Create an authority account for zone management and alert response.</p>
        </div>

        <GlassCard title="Create account (Authority)">
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-white/85">Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="authority@example.com" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-white/85">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
              />
            </label>

            <InlineRow className="pt-1">
              <Button disabled={busy} onClick={onRegister} variant="secondary">
                {busy ? "Creating..." : "Create authority account"}
              </Button>
              <Link href="/login" className="ml-auto">
                <Button variant="ghost">Already have an account?</Button>
              </Link>
            </InlineRow>

            <div className="text-xs text-white/60">
              Tourist user?{" "}
              <Link className="text-cyan-200 hover:text-cyan-100" href="/register">
                Register as User
              </Link>
            </div>
          </div>
        </GlassCard>

        {result && (
          <GlassCard title="Result / debug">
            <Pre value={result} />
          </GlassCard>
        )}
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

