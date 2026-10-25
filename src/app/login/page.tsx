"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });
    setBusy(false);
    if (res?.ok) window.location.href = "/";
    else setError("That email and password don't match.");
  }

  return (
    <div className="mx-auto mt-12 max-w-sm">
      <img src="/icon.svg" alt="" className="mb-4 h-12 w-12" />
      <h1 className="text-3xl font-bold">Watchlist</h1>
      <p className="mt-1 text-paper-muted">Everything on your streaming services, in one place.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-3">
        <input name="email" type="email" required autoComplete="email" placeholder="Email" className="input" />
        <input name="password" type="password" required autoComplete="current-password" placeholder="Password" className="input" />
        {error && <p className="text-sm text-flare">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-paper-muted">
        New here?{" "}
        <Link href="/register" className="text-marquee underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
