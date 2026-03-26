"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Container, Divider, GlassCard, InlineRow } from "./components/Ui";
import { supabase } from "../lib/supabaseClient";
import { backendFetch } from "../lib/backend";

export default function Home() {
  const [role, setRole] = useState<"user" | "authority" | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const hasSession = Boolean(sessionData.session);
        if (!mounted) return;
        if (!hasSession) {
          setRole(null);
          return;
        }
        const me = await backendFetch<{ role: "user" | "authority" }>("/me");
        if (!mounted) return;
        setRole(me.role || null);
      } catch {
        if (!mounted) return;
        setRole(null);
      }
    }

    load().catch(() => {});

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load().catch(() => {});
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const dashboardHref = role === "authority" ? "/authority/dashboard" : "/user/dashboard";

  return (
    <main>
      <Container className="pt-12">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute -bottom-28 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-red-500/10 blur-3xl" />

          <div className="relative">
            <InlineRow className="mb-5">
              <Badge tone="info">MVP</Badge>
              <Badge tone="warning">Geofencing</Badge>
              <Badge tone="danger">SOS</Badge>
              <Badge tone="success">Verification</Badge>
            </InlineRow>

            <h1 className="text-balance text-3xl font-semibold tracking-tight text-white/95 md:text-5xl">
              Smart Tourist Monitoring System
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/70">
              A minimalistic, futuristic safety companion for tourists. Live location monitoring, geofence-based danger
              awareness, instant SOS alerts to authorities, and document-based verification.
            </p>

            <InlineRow className="mt-7">
              <Link href="/register">
                <Button>Register (User)</Button>
              </Link>
              <Link href={role ? dashboardHref : "/login"}>
                <Button variant={role ? "ghost" : "secondary"}>{role ? "Open Dashboard" : "Login"}</Button>
              </Link>
            </InlineRow>

            <Divider className="my-8" />

            <div className="grid gap-4 md:grid-cols-3">
              <GlassCard title="Geofencing">
                <p className="text-sm leading-relaxed text-white/70">
                  Authorities configure danger zones. If you enter a zone, the system can generate a geofence alert and
                  keep context for response.
                </p>
              </GlassCard>
              <GlassCard title="Emergency SOS">
                <p className="text-sm leading-relaxed text-white/70">
                  One tap SOS for fast help. Send an alert to authorities, or call emergency services quickly when you
                  need it most.
                </p>
              </GlassCard>
              <GlassCard title="Verification">
                <p className="text-sm leading-relaxed text-white/70">
                  Upload documents for OCR-based cross-verification with your profile details. Verified users get
                  smoother support during incidents.
                </p>
              </GlassCard>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <GlassCard title="How it works (MVP)">
            <ul className="grid gap-2 text-sm text-white/70">
              <li>1) Register / Login with Supabase</li>
              <li>2) Share live location (browser geolocation)</li>
              <li>3) System checks configured zones and creates alerts</li>
              <li>4) SOS sends an alert to authorities for action</li>
            </ul>
          </GlassCard>
          <GlassCard
            title="Built with"
            right={
              <Badge tone="neutral">
                <span className="text-white/80">FastAPI + Supabase + Next.js</span>
              </Badge>
            }
          >
            <p className="text-sm leading-relaxed text-white/70">
              Backend uses Supabase Auth + DB with RLS. Frontend uses modern UI patterns (glass, gradients, motion) with
              a simple workflow designed for speed under stress.
            </p>
          </GlassCard>
        </div>

        <div className="mt-12">
          <GlassCard title="Authorities (Register)">
            <p className="text-sm leading-relaxed text-white/70">
              If you are police/rescue/admin, use the authorities registration. (User registration stays separate to
              avoid confusion.)
            </p>
            <InlineRow className="mt-4">
              <Link href="/authority/register">
                <Button variant="secondary">Register as Authority</Button>
              </Link>
              <Link href={role ? dashboardHref : "/login"}>
                <Button variant="ghost">{role ? "Open Dashboard" : "Login (same page)"}</Button>
              </Link>
            </InlineRow>
          </GlassCard>
        </div>
      </Container>
    </main>
  );
}
