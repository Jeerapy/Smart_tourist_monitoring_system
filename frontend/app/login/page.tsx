"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { backendFetch } from "../../lib/backend";
import { Badge, Button, Container, GlassCard, InlineRow, Modal, Pre, Toast } from "../components/Ui";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";

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
                <Shield className="h-10 w-10 text-white" />
              </div>
            </motion.div>
            <h2 className="font-mono text-3xl font-bold text-foreground">Smart Tourist Safety</h2>
            <p className="mt-4 text-foreground/60">
              Monitor, protect, and respond — all in real time.
            </p>
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
                <Badge tone="info">User</Badge>
                <Badge tone="neutral">Authority</Badge>
              </InlineRow>
            </div>

            <div className="flex flex-1 items-center justify-center pb-12">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-sm"
              >
                <h1 className="font-mono text-3xl font-bold">Welcome back</h1>
                <p className="mt-2 text-muted-foreground">Same login for both. We’ll route you based on your role.</p>

                <div className="mt-8 glass-card-elevated p-6">
                  <div className="grid gap-4">
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">Email</span>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                        <input
                          className="input-premium"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                        />
                      </div>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-medium">Password</span>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/70" />
                        <input
                          className="input-premium pr-10"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                        />
                      </div>
                    </label>

                    <InlineRow className="pt-1">
                      <Button disabled={busy} onClick={onLogin} className="w-full py-3">
                        {busy ? "Signing in…" : "Sign in"}
                      </Button>
                      <Button variant="ghost" onClick={() => setShowHelp(true)}>
                        Help
                      </Button>
                    </InlineRow>
                  </div>
                </div>

                <p className="mt-8 text-center text-sm text-muted-foreground">
                  New user?{" "}
                  <Link className="font-semibold text-primary hover:underline" href="/register">
                    Register
                  </Link>
                  {" • "}
                  Authority?{" "}
                  <Link className="font-semibold text-primary hover:underline" href="/authority/register">
                    Register as Authority
                  </Link>
                </p>

                {result && (
                  <div className="mt-6">
                    <GlassCard title="Session / debug">
                      <Pre value={result} />
                    </GlassCard>
                  </div>
                )}
              </motion.div>
            </div>
          </Container>
        </div>
      </div>

      <Modal open={showHelp} title="Login help" onClose={() => setShowHelp(false)}>
        <div className="grid gap-3 text-sm text-muted-foreground">
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
    </div>
  );
}

