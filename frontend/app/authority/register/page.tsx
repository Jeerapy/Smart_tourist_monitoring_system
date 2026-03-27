"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { Badge, Button, Container, GlassCard, InlineRow, Pre, Toast } from "../../components/Ui";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";

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
                <div className="h-10 w-10 rounded-full bg-warning shadow-[0_0_22px_rgba(245,158,11,0.55)]" />
              </div>
            </motion.div>
            <h2 className="font-mono text-3xl font-bold text-foreground">Authority Access</h2>
            <p className="mt-4 text-foreground/60">Create an account to manage zones and respond to incidents.</p>
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
                <Badge tone="warning">Authorities</Badge>
                <Badge tone="neutral">Role: authority</Badge>
              </InlineRow>
            </div>

            <div className="flex flex-1 items-center justify-center pb-12">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-sm"
              >
                <h1 className="font-mono text-3xl font-bold">Create authority account</h1>
                <p className="mt-2 text-muted-foreground">Use the same login page after registration.</p>

                <div className="mt-8 glass-card-elevated p-6">
                  <div className="grid gap-4">
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">Email</span>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-warning/70" />
                        <input
                          className="input-premium"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="authority@example.com"
                        />
                      </div>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">Password</span>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-warning/70" />
                        <input
                          className="input-premium pr-10"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Create a password"
                        />
                      </div>
                    </label>

                    <InlineRow className="pt-1">
                      <Button disabled={busy} onClick={onRegister} variant="secondary" className="w-full py-3">
                        {busy ? "Creating…" : "Create account"}
                      </Button>
                      <Link href="/login">
                        <Button variant="ghost">Login</Button>
                      </Link>
                    </InlineRow>
                  </div>
                </div>

                <p className="mt-8 text-center text-sm text-muted-foreground">
                  Tourist user?{" "}
                  <Link className="font-semibold text-primary hover:underline" href="/register">
                    Register as User
                  </Link>
                </p>

                {result && (
                  <div className="mt-6">
                    <GlassCard title="Result / debug">
                      <Pre value={result} />
                    </GlassCard>
                  </div>
                )}
              </motion.div>
            </div>
          </Container>
        </div>
      </div>

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

