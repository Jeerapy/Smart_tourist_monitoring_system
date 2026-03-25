"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Button, Card, Container, Field, Pre } from "../components/Ui";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState(""); // YYYY-MM-DD
  const [place, setPlace] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function onRegister() {
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error("No user id returned from signUp");

      // RLS requires an authenticated session token to insert into `profiles`.
      // If email confirmation is enabled, signUp may NOT create a session.
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) {
          setResult({
            ok: true,
            userId,
            message:
              "Account created, but no session yet (email confirmation may be required). Confirm email, then login and the app can create your profile.",
          });
          return;
        }
        sessionData = { session: signInData.session };
      }

      const { error: insertErr } = await supabase.from("profiles").insert({
        id: userId,
        role: "user",
        full_name: fullName,
        dob: dob || null,
        place: place || null,
      });
      if (insertErr) throw insertErr;

      setResult({ ok: true, userId, message: "Registered. If email confirm is enabled, check inbox." });
    } catch (e: any) {
      setResult({ ok: false, error: e?.message ?? String(e), raw: e });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container>
      <h2>Register (User)</h2>
      <Card title="Create account + profile row">
        <Field label="Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Full name (should match document)">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="DOB (YYYY-MM-DD)">
          <input value={dob} onChange={(e) => setDob(e.target.value)} placeholder="2003-01-31" />
        </Field>
        <Field label="Place">
          <input value={place} onChange={(e) => setPlace(e.target.value)} />
        </Field>
        <Button disabled={busy} onClick={onRegister}>
          {busy ? "Registering..." : "Register"}
        </Button>
      </Card>
      {result && (
        <Card title="Result">
          <Pre value={result} />
        </Card>
      )}
    </Container>
  );
}

