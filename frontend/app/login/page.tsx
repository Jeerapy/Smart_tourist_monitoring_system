"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Button, Card, Container, Field, Pre } from "../components/Ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

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
      setResult({
        ok: true,
        userId: data.user.id,
        access_token: sessionData.session?.access_token,
      });
    } catch (e: any) {
      setResult({ ok: false, error: e?.message ?? String(e), raw: e });
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await supabase.auth.signOut();
    setResult({ ok: true, message: "Signed out" });
  }

  return (
    <Container>
      <h2>Login</h2>
      <Card title="Sign in (Supabase Auth)">
        <Field label="Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div style={{ display: "flex", gap: 10 }}>
          <Button disabled={busy} onClick={onLogin}>
            {busy ? "Logging in..." : "Login"}
          </Button>
          <Button onClick={onLogout}>Logout</Button>
        </div>
      </Card>
      {result && (
        <Card title="Session info">
          <Pre value={result} />
        </Card>
      )}
    </Container>
  );
}

