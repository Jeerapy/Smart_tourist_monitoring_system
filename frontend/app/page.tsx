"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Container, Divider, GlassCard, InlineRow } from "./components/Ui";
import { supabase } from "../lib/supabaseClient";
import { backendFetch } from "../lib/backend";
import { motion } from "framer-motion";
import { AlertTriangle, Bell, Brain, Check, ChevronRight, Eye, MapPin, Phone, Radio, Shield, Sparkles, Users, Zap } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

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
  const loginHref = role ? dashboardHref : "/login";

  const stats = useMemo(() => {
    return [
      { val: "1,489+", label: "Active Users" },
      { val: "99.7%", label: "Uptime" },
      { val: "<30s", label: "Response Time" },
      { val: "24/7", label: "Monitoring" },
    ];
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden">
      <section className="relative flex min-h-[90vh] items-center overflow-hidden">
        <div className="absolute inset-0 gradient-hero" />
        <div className="hero-mesh opacity-80" />
        <div className="particle-grid opacity-60" />
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.25, 0.15] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/4 top-1/4 h-[520px] w-[520px] rounded-full bg-primary/20 blur-[150px]"
        />
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-1/4 right-1/4 h-[420px] w-[420px] rounded-full bg-primary/15 blur-[120px]"
        />

        <Container className="relative py-16 sm:py-20 md:py-28">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/90 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 text-warning" />
                Smart Tourist Safety
              </div>

              <h1 className="mt-6 text-balance font-mono text-4xl font-bold leading-[1.08] md:text-5xl lg:text-[3.35rem]">
                <span className="block text-white">Travel Safe,</span>
                <span className="block text-gradient-hero">Stay Connected</span>
              </h1>

              <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/55">
                Advanced safety monitoring system that keeps tourists protected with real-time tracking, smart alerts, and instant emergency response.
              </p>

              <InlineRow className="mt-10">
                <Link href="/register">
                  <Button className="px-7 py-3.5 text-sm">
                    Get Started <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/#features">
                  <Button variant="secondary" className="px-7 py-3.5 text-sm">
                    Explore Features <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </InlineRow>

              <InlineRow className="mt-6">
                <Badge tone="info">Live tracking</Badge>
                <Badge tone="warning">Geofencing</Badge>
                <Badge tone="danger">SOS</Badge>
                <Badge tone="success">Verification</Badge>
                <Link href="/authority/register" className="ml-auto text-xs text-white/75 underline-offset-4 hover:underline">
                  Authority register
                </Link>
              </InlineRow>
            </motion.div>

            <div className="hidden lg:block">
              <div className="relative h-[440px]">
                <motion.div
                  initial={{ opacity: 0, x: 26, y: 10 }}
                  animate={{ opacity: 1, x: 0, y: [0, -12, 0] }}
                  transition={{
                    opacity: { delay: 0.5 },
                    x: { delay: 0.5 },
                    y: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 },
                  }}
                  className="absolute right-0 top-6 w-[280px]"
                >
                  <div className="glass-card-elevated p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-critical/20 p-2">
                        <AlertTriangle className="h-4 w-4 text-critical" />
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wider text-white/40">Active alert</div>
                        <div className="mt-0.5 text-base font-semibold text-white">Geofence Breach</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-white/35">Tourist Zone A • 2 min ago</div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -26, y: 10 }}
                  animate={{ opacity: 1, x: 0, y: [0, -8, 0] }}
                  transition={{
                    opacity: { delay: 0.7 },
                    x: { delay: 0.7 },
                    y: { duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1.3 },
                  }}
                  className="absolute left-0 top-36 w-[260px]"
                >
                  <div className="glass-card-elevated p-4">
                    <div className="mb-3 flex items-center gap-2 text-xs text-white/65">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span className="font-medium">Live Tracking</span>
                    </div>
                    <div className="relative h-24 overflow-hidden rounded-lg border border-border bg-card/40">
                      <div className="absolute inset-0 particle-grid opacity-30" />
                      <motion.div
                        animate={{ x: [0, 8, -4, 6, 0], y: [0, -5, 3, -8, 0] }}
                        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                      >
                        <div className="h-3 w-3 rounded-full bg-primary shadow-[0_0_12px_3px_rgba(59,130,246,0.5)]" />
                      </motion.div>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: [0, -10, 0] }}
                  transition={{
                    opacity: { delay: 0.9 },
                    y: { duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1.7 },
                  }}
                  className="absolute bottom-10 right-8 w-[260px]"
                >
                  <div className="glass-card-elevated p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/40">
                      <Shield className="h-4 w-4 text-safe" />
                      Protected users
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gradient">1,489+</div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-safe">
                      <Check className="h-3.5 w-3.5" />
                      All tourists safe
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-12">
            <div className="glass-card-elevated grid grid-cols-2 divide-x divide-border/50 overflow-hidden md:grid-cols-4">
              {stats.map((s, i) => (
                <motion.div key={s.label} className="px-4 py-7 text-center" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <div className="text-2xl font-bold text-gradient">{s.val}</div>
                  <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    {s.label}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section id="features" className="py-20 sm:py-24">
        <Container>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} className="mx-auto mb-12 max-w-2xl text-center">
            <motion.p variants={fadeUp} custom={0} className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Features</motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="mt-3 text-3xl font-bold md:text-5xl">
              Everything you need to <span className="text-gradient">stay safe</span>
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="mt-4 text-muted-foreground">
              Comprehensive tools designed to protect travelers and help authorities respond fast.
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: MapPin,
                title: "Real-Time Tracking",
                desc: "GPS-based location monitoring with live map updates for tourists and authorities.",
                tone: "text-primary",
              },
              {
                icon: Bell,
                title: "Geofencing Alerts",
                desc: "Automatic notifications when tourists enter or leave designated safety zones.",
                tone: "text-warning",
              },
              {
                icon: Phone,
                title: "SOS Emergency",
                desc: "One-tap emergency button that instantly alerts nearby authorities with your location.",
                tone: "text-critical",
              },
              {
                icon: Brain,
                title: "Smart Detection",
                desc: "Pattern-based detection to identify unusual behavior and potential threats.",
                tone: "text-primary",
              },
            ].map((f, i) => (
              <motion.div key={f.title} variants={scaleIn} custom={i}>
                <GlassCard className="card-hover h-full">
                  <div className="mb-4 w-fit rounded-xl bg-primary/10 p-3">
                    <f.icon className={`h-5 w-5 ${f.tone}`} />
                  </div>
                  <div className="text-lg font-semibold">{f.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</div>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </Container>
      </section>

      <section id="how-it-works" className="relative overflow-hidden py-20 sm:py-24">
        <div className="absolute inset-0 bg-secondary/30" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent" />
        <Container className="relative">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">How it works</p>
            <h2 className="mt-3 text-3xl font-bold md:text-5xl">
              Simple, secure, <span className="text-gradient">smart</span>
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            {[
              { num: "01", title: "Register & Verify", desc: "Create your account and verify your identity.", icon: Users },
              { num: "02", title: "Enable Tracking", desc: "Allow location services for real-time monitoring.", icon: MapPin },
              { num: "03", title: "Detect Risks", desc: "Zone analysis identifies threats quickly.", icon: Radio },
              { num: "04", title: "Stay Protected", desc: "Use SOS and authorities are notified instantly.", icon: Shield },
            ].map((s, i) => (
              <motion.div key={s.num} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12, duration: 0.5 }} className="relative">
                <div className="glass-card-elevated card-hover h-full p-6 text-center">
                  <div className="mx-auto -mt-10 mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-lg shadow-primary/30">
                    {s.num}
                  </div>
                  <div className="mx-auto mb-3 w-fit rounded-xl bg-primary/10 p-3">
                    <s.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-lg font-semibold">{s.title}</div>
                  <div className="mt-2 text-sm text-muted-foreground">{s.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </Container>
      </section>

      <section id="about" className="py-20 sm:py-24">
        <Container>
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">About</p>
              <h2 className="mt-3 text-3xl font-bold md:text-5xl">
                Protecting travelers <span className="text-gradient">worldwide</span>
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                STMS combines practical safety workflows with real-time monitoring to create a trusted protection
                network for tourists and authorities.
              </p>

              <Divider className="my-8" />

              <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { icon: Eye, label: "24/7 Monitoring" },
                { icon: Zap, label: "Instant Response" },
                { icon: Shield, label: "Verified Safety" },
                { icon: MapPin, label: "Global Coverage" },
              ].map((t) => (
                <div key={t.label} className="glass-card flex items-center gap-3 p-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <t.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="font-medium text-foreground/90">{t.label}</span>
                </div>
              ))}
              </div>
            </div>

            <div className="glass-card-elevated relative overflow-hidden p-8">
              <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-primary/10 blur-[60px]" />
              <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-primary/10 blur-[50px]" />
              <div className="relative grid grid-cols-2 gap-8 text-center">
                {stats.map((s) => (
                  <div key={s.label}>
                    <div className="text-3xl font-bold text-gradient">{s.val}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 gradient-hero" />
        <div className="hero-mesh" />
        <div className="absolute inset-0 particle-grid opacity-40" />
        <Container className="relative text-center">
          <div className="mx-auto max-w-2xl">
            <div className="mx-auto mb-6 w-fit rounded-2xl border border-border/70 bg-card/30 p-4 backdrop-blur-xl">
              <Shield className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-foreground md:text-5xl">
              Ready to travel <span className="text-gradient-hero">safely?</span>
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              Create your account, enable tracking, and use SOS when needed. Authorities see incidents in real-time.
            </p>
            <InlineRow className="mt-9 justify-center">
              <Link href="/register">
                <Button className="px-8 py-4">Get Started <ChevronRight className="h-4 w-4" /></Button>
              </Link>
              <Link href={loginHref}>
                <Button variant="secondary" className="px-8 py-4">
                  {role ? "Open Dashboard" : "Sign in"}
                </Button>
              </Link>
            </InlineRow>
          </div>
        </Container>
      </section>

      <footer className="border-t border-border bg-card/30 py-10">
        <Container className="py-0">
          <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-primary/10 p-2">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <span className="font-bold">STMS</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2026 Smart Tourist Safety Monitoring System. All rights reserved.
            </p>
          </div>
        </Container>
      </footer>
    </main>
  );
}
