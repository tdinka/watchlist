"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FavoriteButton({
  tmdbId,
  mediaType,
  title,
  posterPath,
  initial,
  variant = "button",
}: {
  tmdbId: number;
  mediaType: "tv" | "movie";
  title: string;
  posterPath: string | null;
  initial: boolean;
  variant?: "button" | "icon";
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !on;
    setOn(next);
    const res = next
      ? await fetch("/api/favorites", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tmdbId, mediaType, title, posterPath }),
        })
      : await fetch(`/api/favorites?type=${mediaType}&id=${tmdbId}`, { method: "DELETE" });
    if (!res.ok) setOn(!next);
    setBusy(false);
    router.refresh();
  }

  const label = on ? `Remove ${title} from favorites` : `Add ${title} to favorites`;
  const heart = (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z" />
    </svg>
  );

  if (variant === "icon") {
    return (
      <button
        onClick={toggle}
        disabled={busy}
        aria-label={label}
        aria-pressed={on}
        className={`grid h-8 w-8 place-items-center rounded-full bg-night/80 backdrop-blur transition ${on ? "text-marquee" : "text-paper hover:text-marquee"}`}
      >
        {heart}
      </button>
    );
  }
  return (
    <button onClick={toggle} disabled={busy} aria-pressed={on} className={on ? "btn-quiet" : "btn-primary"}>
      {heart}
      {on ? "In favorites" : mediaType === "tv" ? "Favorite & follow" : "Add to favorites"}
    </button>
  );
}
