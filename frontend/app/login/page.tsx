"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { backendFetch } from "../../lib/backend";
import { Badge, Button, Container, GlassCard, InlineRow, Modal, Pre, Toast } from "../components/Ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastTone, setToastTone] = useState<"info" | "success" | "warning" | "danger">("info");
  const [toastTitle, setToastTitle] = useState(" ");
  const [toastMessage, setToastMessage] = useState<string | undefined>(undefined);
  const [showHelp, setShowHelp] = useState(false);

  function showToast(tone: "info" | "success" | "warning" | "danger", title: string, message?: string) {
    setToastTone(tone);
    setToastTitle(title);
    setToastMessage(message);
    setToastOpen(true);
  }

  async function onLogin() {
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      const { data: sessionData } = await supabase.auth.getSession();
      const me = await backendFetch<{ user_id: string; role: "user" | "authority" }>("/me");

      setResult({
        ok: true,
        userId: data.user.id,
        access_token: sessionData.session?.access_token,
        role: me.role,
      });
      showToast("success", "Logged in", `Role: ${me.role}`);

      router.replace(me.role === "authority" ? "/authority/dashboard" : "/user/dashboard");
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setResult({ ok: false, error: msg, raw: e });
      showToast("danger", "Login failed", msg);
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await supabase.auth.signOut();
    setResult({ ok: true, message: "Signed out" });
    showToast("info", "Signed out");
  }

  return (
    <Container className="pt-12">
      <div className="mx-auto grid w-full max-w-xl gap-5">
        <div className="text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <Badge tone="info">User</Badge>
            <Badge tone="neutral">Authority</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white/95">Login</h1>
          <p className="mt-2 text-sm text-white/65">Same login for both. We’ll route you based on your role.</p>
        </div>

        <GlassCard title="Sign in">
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-white/85">Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-white/85">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
              />
            </label>

            <InlineRow className="pt-1">
              <Button disabled={busy} onClick={onLogin}>
                {busy ? "Logging in..." : "Login"}
              </Button>
              <Button variant="ghost" onClick={() => setShowHelp(true)}>
                Help
              </Button>
              <div className="ml-auto">
                <Button variant="secondary" onClick={onLogout}>
                  Logout
                </Button>
              </div>
            </InlineRow>

            <div className="text-xs text-white/60">
              New user?{" "}
              <Link className="text-cyan-200 hover:text-cyan-100" href="/register">
                Register
              </Link>
              {" • "}
              Authority?{" "}
              <Link className="text-cyan-200 hover:text-cyan-100" href="/authority/register">
                Register as Authority
              </Link>
            </div>
          </div>
        </GlassCard>

        {result && (
          <GlassCard title="Session / debug">
            <Pre value={result} />
          </GlassCard>
        )}
      </div>

      <Modal open={showHelp} title="Login help" onClose={() => setShowHelp(false)}>
        <div className="grid gap-3 text-sm text-white/70">
          <p>
            This app uses Supabase Auth. After signing in, it calls the backend endpoint <code>/me</code> to read your
            role from <code>public.profiles.role</code>.
          </p>
          <p>If your role is missing, the backend will reject the request. Register first to create your profile row.</p>
          <InlineRow className="pt-2">
            <Link href="/register">
              <Button>Register (User)</Button>
            </Link>
            <Link href="/authority/register">
              <Button variant="secondary">Register (Authority)</Button>
            </Link>
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

