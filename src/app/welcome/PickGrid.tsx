"use client";

import Link from "next/link";
import { useState } from "react";
import { imageUrl, type TitleSummary } from "@/lib/tmdb";

export function PickGrid({ tv, movies }: { tv: TitleSummary[]; movies: TitleSummary[] }) {
  const [tab, setTab] = useState<"tv" | "movies">("tv");
  const [picked, setPicked] = useState<Map<string, TitleSummary>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = tab === "tv" ? tv : movies;

  function toggle(t: TitleSummary) {
    setPicked((prev) => {
      const next = new Map(prev);
      const key = `${t.mediaType}:${t.id}`;
      if (next.has(key)) next.delete(key);
      else next.set(key, t);
      return next;
    });
  }

  async function done() {
    setBusy(true);
    setError(null);
    const items = Array.from(picked.values()).map((t) => ({ tmdbId: t.id, mediaType: t.mediaType, title: t.title, posterPath: t.posterPath }));
    const res = await fetch("/api/favorites/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (res.ok) window.location.href = "/for-you";
    else {
      setBusy(false);
      setError("Couldn't save those. Try again.");
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        {(["tv", "movies"] as const).map((t) => (
          <button key={t} className={`chip ${tab === t ? "chip-on" : ""}`} onClick={() => setTab(t)}>
            {t === "tv" ? "Shows" : "Movies"}
          </button>
        ))}
        <Link href="/import" className="ml-auto text-sm text-marquee underline">
          Import your Netflix history instead
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
        {list.map((t) => {
          const on = picked.has(`${t.mediaType}:${t.id}`);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t)}
              aria-pressed={on}
              aria-label={t.title}
              className={`relative overflow-hidden rounded-lg text-left ring-2 transition ${on ? "ring-marquee" : "ring-transparent hover:ring-night-line"}`}
            >
              <img src={imageUrl(t.posterPath, "w342")!} alt="" loading="lazy" className={`aspect-[2/3] w-full object-cover ${on ? "opacity-60" : ""}`} />
              {on && (
                <span className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-marquee text-sm font-bold text-night">✓</span>
              )}
              <span className="block truncate px-0.5 py-1 text-xs text-paper-muted">{t.title}</span>
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-20 mt-6 flex items-center gap-3 rounded-xl border border-night-line bg-night-surface/95 p-3 backdrop-blur md:bottom-4">
        <button className="btn-primary" disabled={picked.size === 0 || busy} onClick={done}>
          {busy ? "Saving…" : picked.size === 0 ? "Pick a few" : `Done, add ${picked.size}`}
        </button>
        <Link href="/" className="text-sm text-paper-muted hover:text-paper">
          Skip for now
        </Link>
        {error && <span className="text-sm text-flare">{error}</span>}
      </div>
    </div>
  );
}
