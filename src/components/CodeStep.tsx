"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

// Step two of signing in or up: type the 6-digit code that was emailed.
export function CodeStep({
  email,
  resend,
  onBack,
  redirectTo,
}: {
  email: string;
  resend: () => Promise<string | null>; // asks for a new code; returns an error message or null
  onBack: () => void;
  redirectTo: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", { email, code: value, redirect: false });
    if (res?.ok) {
      window.location.href = redirectTo;
      return;
    }
    setBusy(false);
    setError("That code didn't work. Check the newest email, or send a new code.");
  }

  return (
    <div>
      <p className="text-paper-muted">
        We emailed a 6-digit code to <span className="text-paper">{email}</span>. It works for 10 minutes.
      </p>
      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(code);
        }}
      >
        <input
          className="input text-center font-mono text-2xl tracking-[0.5em]"
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(digits);
            if (digits.length === 6 && !busy) submit(digits);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          aria-label="6-digit code"
          autoFocus
        />
        {error && <p className="text-sm text-flare">{error}</p>}
        {note && <p className="text-sm text-paper-muted">{note}</p>}
        <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
      <div className="mt-6 flex justify-between text-sm">
        <button className="text-paper-muted hover:text-paper" onClick={onBack}>
          ← Use a different email
        </button>
        <button
          className="text-marquee underline"
          onClick={async () => {
            setError(null);
            setNote(null);
            const problem = await resend();
            if (problem) setError(problem);
            else {
              setCode("");
              setNote("New code sent. Older codes no longer work.");
            }
          }}
        >
          Send a new code
        </button>
      </div>
    </div>
  );
}

export async function requestCode(body: unknown): Promise<string | null> {
  const res = await fetch("/api/auth/request-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return null;
  return (await res.json().catch(() => null))?.error ?? "Something went wrong. Try again.";
}
