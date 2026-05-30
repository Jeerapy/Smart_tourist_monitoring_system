"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { backendFetch } from "../../lib/backend";

export function Container({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={clsx("mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8", className)}>{children}</div>;
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
    <div className="sticky top-0 z-50 glass-nav">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight">Smart Tourist</div>
            <div className="text-xs text-muted-foreground">Safety • Geofence • SOS</div>
          </div>
        </Link>

        <div className="ml-auto hidden items-center gap-1 text-sm lg:flex">
          <Link className="nav-link-underline px-3 py-2 text-muted-foreground hover:text-foreground" href="/#features">
            Features
          </Link>
          <Link className="nav-link-underline px-3 py-2 text-muted-foreground hover:text-foreground" href="/#how-it-works">
            How it works
          </Link>
          <Link className="nav-link-underline px-3 py-2 text-muted-foreground hover:text-foreground" href="/#about">
            About
          </Link>
          <Link className="nav-link-underline px-3 py-2 text-muted-foreground hover:text-foreground" href="/register">
            Register
          </Link>
          <Link
            className="btn-glow rounded-lg bg-primary px-4 py-2 font-semibold !text-white hover:opacity-90 no-underline hover:no-underline"
            href={role ? dashboardHref : "/login"}
          >
            {role ? "Open Dashboard" : "Login"}
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-2 text-sm lg:hidden">
          <Link className="rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-foreground" href="/register">
            Register
          </Link>
          <Link className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-white" href={role ? dashboardHref : "/login"}>
            {role ? "Dashboard" : "Login"}
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
        "glass-card-elevated p-5",
        className
      )}
    >
      {(title || right) && (
        <div className="mb-4 flex items-start gap-3">
          {title && <div className="text-sm font-semibold tracking-tight text-foreground">{title}</div>}
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
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={clsx("my-5 h-px w-full bg-border", className)} />;
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
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  variant?: ButtonVariant;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-all active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50";

  const styles: Record<ButtonVariant, string> = {
    primary: "btn-glow border-primary bg-primary text-primary-foreground hover:opacity-90",
    secondary: "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "border-border bg-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
    danger:
      "border-critical/70 bg-critical/90 text-critical-foreground shadow-[0_10px_30px_rgba(239,68,68,0.18)] hover:brightness-110",
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
    neutral: "border-border bg-secondary text-foreground/80",
    success: "border-safe/30 bg-safe/15 text-safe-foreground",
    warning: "border-warning/30 bg-warning/15 text-warning",
    danger: "border-critical/30 bg-critical/15 text-critical",
    info: "border-primary/30 bg-primary/15 text-primary",
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
        "max-h-[360px] overflow-auto rounded-2xl border border-border bg-card/70 p-4 text-xs text-foreground/90",
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
          <button
            aria-label="Close modal"
            className="absolute inset-0 bg-background/90 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-lg rounded-2xl border border-border/70 bg-background/95 p-5 text-foreground shadow-[0_30px_90px_rgba(0,0,0,0.6)] backdrop-blur-xl"
            initial={{ y: 14, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mb-4 flex items-start gap-3">
              {title && <div className="text-base font-semibold text-foreground">{title}</div>}
              <button
                className="ml-auto rounded-lg border border-border bg-secondary/70 px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
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
    info: "border-primary/30 bg-primary/10",
    success: "border-safe/30 bg-safe/10",
    warning: "border-warning/30 bg-warning/10",
    danger: "border-critical/30 bg-critical/10",
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
          <div className={clsx("glass-card rounded-2xl border p-4", toneStyles[tone])}>
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{title}</div>
                {message && <div className="mt-1 text-xs text-muted-foreground">{message}</div>}
              </div>
              <button
                className="ml-auto rounded-lg border border-border bg-secondary/60 px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
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

