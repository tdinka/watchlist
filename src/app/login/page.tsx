"use client";

import Link from "next/link";
import { useState } from "react";
import { CodeStep, requestCode } from "@/components/CodeStep";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const problem = await requestCode({ email });
    setBusy(false);
    if (problem) setError(problem);
    else setSent(true);
  }

  return (
    <div className="mx-auto mt-12 max-w-sm">
      <img src="/icon.svg" alt="" className="mb-4 h-12 w-12" />
      <h1 className="text-3xl font-bold">{sent ? "Check your email" : "Watchlist"}</h1>
      {sent ? (
        <div className="mt-2">
          <CodeStep email={email} resend={() => requestCode({ email })} onBack={() => setSent(false)} redirectTo="/" />
        </div>
      ) : (
        <>
          <p className="mt-1 text-paper-muted">Everything on your streaming services, in one place.</p>
          <form onSubmit={onSubmit} className="mt-8 space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <p className="text-sm text-flare">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "Sending…" : "Email me a sign-in code"}
            </button>
          </form>
          <p className="mt-6 text-sm text-paper-muted">
            New here?{" "}
            <Link href="/register" className="text-marquee underline">
              Create an account
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
