"use client";

import Link from "next/link";
import { useState } from "react";
import { CodeStep, requestCode } from "@/components/CodeStep";

export default function RegisterPage() {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [request, setRequest] = useState<object | null>(null); // what was sent, for "Send a new code"
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const body = {
      email: form.email,
      signup: {
        name: form.name,
        mode,
        householdName: mode === "create" ? form.householdName : undefined,
        inviteCode: mode === "join" ? form.inviteCode : undefined,
      },
    };
    const problem = await requestCode(body);
    setBusy(false);
    if (problem) setError(problem);
    else {
      setEmail(form.email);
      setRequest(body);
    }
  }

  if (request) {
    return (
      <div className="mx-auto mt-12 max-w-sm">
        <h1 className="text-3xl font-bold">Check your email</h1>
        <div className="mt-2">
          <CodeStep
            email={email}
            resend={() => requestCode(request)}
            onBack={() => setRequest(null)}
            // New households check their services first; everyone then picks favorites.
            redirectTo={mode === "create" ? "/settings?welcome=1" : "/welcome"}
          />
        </div>
      </div>
    );
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
        <input name="email" type="email" required placeholder="Email" className="input" autoComplete="email" defaultValue={email} />
        {mode === "create" ? (
          <input name="householdName" required placeholder="Household name, e.g. The Dinkas" className="input" />
        ) : (
          <input name="inviteCode" required placeholder="Invite code from Settings" className="input uppercase" />
        )}
        {error && <p className="text-sm text-flare">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Sending…" : "Email me a code"}
        </button>
        <p className="text-xs text-paper-faint">No password needed. Each time you sign in, we email you a code.</p>
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
