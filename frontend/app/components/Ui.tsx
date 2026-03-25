import Link from "next/link";

export function Container({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 20 }}>{children}</div>
  );
}

export function TopNav() {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "12px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        background: "linear-gradient(180deg, rgba(11,22,48,0.9), rgba(6,11,22,0.9))",
      }}
    >
      <strong>Smart Tourist (Test UI)</strong>
      <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
        <Link href="/">Home</Link>
        <Link href="/register">Register</Link>
        <Link href="/login">Login</Link>
        <Link href="/user/dashboard">User Dashboard</Link>
        <Link href="/authority/dashboard">Authority Dashboard</Link>
      </div>
    </div>
  );
}

export function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        padding: 14,
        marginTop: 14,
        background: "rgba(11, 22, 48, 0.85)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

export function Button({
  children,
  onClick,
  type,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type || "button"}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.14)",
        background: disabled ? "rgba(255,255,255,0.06)" : "linear-gradient(180deg, #2563eb, #1d4ed8)",
        color: disabled ? "rgba(255,255,255,0.5)" : "white",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function InlineRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      {children}
    </div>
  );
}

export function Pre({ value }: { value: any }) {
  return (
    <pre
      style={{
        padding: 12,
        borderRadius: 10,
        background: "rgba(0,0,0,0.35)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "rgba(255,255,255,0.92)",
        overflow: "auto",
        fontSize: 12,
      }}
    >
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

