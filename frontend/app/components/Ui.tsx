"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { backendFetch } from "../../lib/backend";

export function Container({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={clsx("mx-auto w-full max-w-6xl px-5 py-10", className)}>{children}</div>;
}

export function TopNav() {
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
    <div className="sticky top-0 z-50 border-b border-white/10 bg-[linear-gradient(180deg,rgba(11,22,48,0.72),rgba(6,11,22,0.82))] backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 py-3">
        <Link href="/" className="group flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_14px_35px_rgba(0,0,0,0.35)]" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Smart Tourist</div>
            <div className="text-xs text-white/60">Safety • Geofence • SOS</div>
          </div>
        </Link>

        <div className="ml-auto hidden items-center gap-3 text-sm text-white/80 md:flex">
          <Link className="hover:text-white" href="/register">
            Register
          </Link>
          <Link className="hover:text-white" href={role ? dashboardHref : "/login"}>
            {role ? "Open Dashboard" : "Login"}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function GlassCard({
  title,
  children,
  className,
  right,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur",
        className
      )}
    >
      {(title || right) && (
        <div className="mb-4 flex items-start gap-3">
          {title && <div className="text-sm font-semibold tracking-tight text-white/90">{title}</div>}
          <div className="ml-auto">{right}</div>
        </div>
      )}
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-white/85">{label}</span>
      {children}
      {hint && <span className="text-xs text-white/55">{hint}</span>}
    </label>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={clsx("my-5 h-px w-full bg-white/10", className)} />;
}

export function InlineRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("flex flex-wrap items-center gap-3", className)}>{children}</div>;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  onClick,
  type,
  disabled,
  className,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  variant?: ButtonVariant;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition will-change-transform active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50";

  const styles: Record<ButtonVariant, string> = {
    primary:
      "border border-white/10 bg-[linear-gradient(180deg,#2563EB,#1D4ED8)] text-white shadow-[0_10px_30px_rgba(37,99,235,0.25)] hover:brightness-110",
    secondary: "border border-white/10 bg-white/10 text-white/90 hover:bg-white/12",
    ghost: "border border-white/10 bg-transparent text-white/80 hover:bg-white/5 hover:text-white",
    danger:
      "border border-white/10 bg-[linear-gradient(180deg,#EF4444,#B91C1C)] text-white shadow-[0_10px_30px_rgba(239,68,68,0.18)] hover:brightness-110",
  };

  return (
    <button
      type={type || "button"}
      disabled={disabled}
      onClick={onClick}
      className={clsx(base, styles[variant], className)}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-white/10 text-white/80 border-white/10",
    success: "bg-emerald-400/15 text-emerald-200 border-emerald-300/20",
    warning: "bg-amber-400/15 text-amber-200 border-amber-300/20",
    danger: "bg-red-400/15 text-red-200 border-red-300/20",
    info: "bg-cyan-400/15 text-cyan-200 border-cyan-300/20",
  };
  return (
    <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

export function Pre({ value, className }: { value: any; className?: string }) {
  return (
    <pre
      className={clsx(
        "max-h-[360px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/85",
        className
      )}
    >
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button aria-label="Close modal" className="absolute inset-0 bg-black/60" onClick={onClose} />
          <motion.div
            className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[rgba(10,18,38,0.75)] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.6)] backdrop-blur"
            initial={{ y: 14, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mb-4 flex items-start gap-3">
              {title && <div className="text-base font-semibold text-white/90">{title}</div>}
              <button
                className="ml-auto rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                onClick={onClose}
              >
                Esc
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toast({
  open,
  title,
  message,
  tone = "info",
  onClose,
}: {
  open: boolean;
  title: string;
  message?: string;
  tone?: "info" | "success" | "warning" | "danger";
  onClose: () => void;
}) {
  const toneStyles: Record<string, string> = {
    info: "border-cyan-300/20 bg-cyan-400/10",
    success: "border-emerald-300/20 bg-emerald-400/10",
    warning: "border-amber-300/20 bg-amber-400/10",
    danger: "border-red-300/20 bg-red-400/10",
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed bottom-5 right-5 z-[1100] w-[min(420px,calc(100vw-40px))]"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.18 }}
        >
          <div className={clsx("rounded-2xl border p-4 backdrop-blur", toneStyles[tone])}>
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white/90">{title}</div>
                {message && <div className="mt-1 text-xs text-white/70">{message}</div>}
              </div>
              <button
                className="ml-auto rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

