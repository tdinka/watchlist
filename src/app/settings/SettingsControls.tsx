"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Provider } from "@/lib/tmdb";
import { ServiceLogo } from "@/components/ServiceLogos";

export function ServicesPicker({ catalog, selected }: { catalog: Provider[]; selected: number[] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState(new Set(selected));
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showAll, setShowAll] = useState(false);

  const list = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matches = catalog.filter((p) => !q || p.name.toLowerCase().includes(q));
    // Chosen ones first, then the most popular.
    const sorted = [...matches.filter((p) => chosen.has(p.id)), ...matches.filter((p) => !chosen.has(p.id))];
    return q || showAll ? sorted : sorted.slice(0, 24);
    // Only re-sort when the filter changes, not on every tick, so items don't jump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, filter, showAll]);

  async function save(next: Set<number>) {
    setChosen(next);
    setStatus("saving");
    const res = await fetch("/api/household", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ services: Array.from(next) }),
    });
    setStatus(res.ok ? "saved" : "error");
    router.refresh();
  }

  return (
    <div>
      <input className="input max-w-xs" placeholder="Find a service" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => {
          const on = chosen.has(p.id);
          return (
            <label
              key={p.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${on ? "border-live/60 bg-live-soft" : "border-night-line hover:bg-night-raised"}`}
            >
              <input
                type="checkbox"
                className="accent-[#4ADE80]"
                checked={on}
                onChange={() => {
                  const next = new Set(chosen);
                  if (on) next.delete(p.id);
                  else next.add(p.id);
                  save(next);
                }}
              />
              <ServiceLogo provider={p} size={24} />
              <span className="text-sm">{p.name}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-sm">
        {!filter && !showAll && catalog.length > 24 && (
          <button className="text-marquee underline" onClick={() => setShowAll(true)}>
            Show all {catalog.length} services
          </button>
        )}
        <span className="text-paper-faint">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save, try again" : ""}
        </span>
      </div>
    </div>
  );
}

export function EmailToggle({ initial, configured }: { initial: boolean; configured: boolean }) {
  const [on, setOn] = useState(initial);
  const [test, setTest] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[#F4B740]"
          checked={on}
          onChange={async (e) => {
            const next = e.target.checked;
            setOn(next);
            const res = await fetch("/api/me", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ emailAlerts: next }),
            });
            if (!res.ok) setOn(!next);
          }}
        />
        <span>Email me about new seasons, new episodes, and titles from my lists arriving on our services</span>
      </label>
      {configured ? (
        <div className="flex items-center gap-3">
          <button
            className="btn-quiet"
            onClick={async () => {
              setTest("Sending…");
              const res = await fetch("/api/email-test", { method: "POST" });
              setTest(res.ok ? "Sent! Check your inbox." : ((await res.json().catch(() => null))?.error ?? "Didn't send."));
            }}
          >
            Send me a test email
          </button>
          {test && <span className="text-sm text-paper-muted">{test}</span>}
        </div>
      ) : (
        <p className="text-sm text-paper-faint">Email sending isn&apos;t switched on for this app yet, so alerts only show in the app for now.</p>
      )}
    </div>
  );
}

type CheckResult = { titlesChecked: number; alertsCreated: number; emailsSent: number; emailNote: string | null; errors: string[] };

export function CheckNowButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  return (
    <div className="space-y-2">
      <button
        className="btn-quiet"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/check-now", { method: "POST" });
          setResult(res.ok ? await res.json() : null);
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Checking…" : "Check for new episodes now"}
      </button>
      {result && (
        <p className="text-sm text-paper-muted">
          Checked {result.titlesChecked} title{result.titlesChecked === 1 ? "" : "s"}: {result.alertsCreated} new alert
          {result.alertsCreated === 1 ? "" : "s"}
          {result.emailsSent ? `, ${result.emailsSent} email${result.emailsSent === 1 ? "" : "s"} sent` : ""}.
          {result.errors.length > 0 && ` ${result.errors.length} couldn't be checked.`}
        </p>
      )}
    </div>
  );
}

export function HouseholdName({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex max-w-md gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/household", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        setSaved(res.ok);
      }}
    >
      <input className="input" value={name} onChange={(e) => (setName(e.target.value), setSaved(false))} aria-label="Household name" />
      <button className="btn-quiet shrink-0">{saved ? "Saved" : "Save"}</button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <button className="btn-quiet" onClick={() => signOut({ callbackUrl: "/login" })}>
      Sign out
    </button>
  );
}
