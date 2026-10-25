"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function RegisterPage() {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, mode }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    await signIn("credentials", { email: form.email, password: form.password, redirect: false });
    // New households start in Settings to check their services.
    window.location.href = mode === "create" ? "/settings?welcome=1" : "/";
  }

  return (
    <div className="mx-auto mt-12 max-w-sm">
      <h1 className="text-3xl font-bold">Create your account</h1>
      <div className="mt-6 grid grid-cols-2 gap-1 rounded-full border border-night-line p-1">
        {(["create", "join"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full py-1.5 text-sm ${mode === m ? "bg-night-raised text-paper" : "text-paper-muted"}`}
          >
            {m === "create" ? "Start a household" : "Join with a code"}
          </button>
        ))}
      </div>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input name="name" required placeholder="Your first name" className="input" autoComplete="given-name" />
        <input name="email" type="email" required placeholder="Email" className="input" autoComplete="email" />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="Password (8+ characters)"
          className="input"
          autoComplete="new-password"
        />
        {mode === "create" ? (
          <input name="householdName" required placeholder="Household name, e.g. The Dinkas" className="input" />
        ) : (
          <input name="inviteCode" required placeholder="Invite code from Settings" className="input uppercase" />
        )}
        {error && <p className="text-sm text-flare">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-sm text-paper-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-marquee underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
