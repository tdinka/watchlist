"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ALERT_LEVELS, type AlertLevel } from "@/lib/alert-levels";

// "Alerts: Every episode / New seasons only / Off" on a show's page.
export function AlertSetting({ tmdbId, initial, automatic }: { tmdbId: number; initial: AlertLevel | null; automatic: AlertLevel }) {
  const router = useRouter();
  const [level, setLevel] = useState<AlertLevel>(initial ?? automatic);
  const [failed, setFailed] = useState(false);

  async function choose(next: AlertLevel) {
    const before = level;
    setLevel(next);
    setFailed(false);
    const res = await fetch("/api/show-alerts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tmdbId, level: next }),
    });
    if (!res.ok) {
      setLevel(before);
      setFailed(true);
    }
    router.refresh();
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-paper-faint">Alerts for this show</h3>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Alerts for this show">
        {ALERT_LEVELS.map((o) => (
          <button key={o.value} role="radio" aria-checked={level === o.value} onClick={() => choose(o.value)} className={`chip ${level === o.value ? "chip-on" : ""}`}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-paper-faint">
        {failed
          ? "Couldn't save that. Try again."
          : level === "off"
            ? "No alerts about this show, including when it arrives on or leaves your services."
            : level === "seasons"
              ? `Only when a new season starts${automatic === "seasons" && !initial ? " (the usual for shows that air almost daily)" : ""}. Episodes come out too often to be news.`
              : "New episodes you can watch on your services, grouped into one alert until you've seen it."}
      </p>
    </div>
  );
}
