"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ListName, Saved } from "@/lib/favorites";

const HEART = "M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z";
const BOOKMARK = "M6 3h12v18l-6-4-6 4z";
const CHECK = "M5 12.5l4.5 4.5L19 7.5";

function Icon({ d, filled }: { d: string; filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

// "Want to watch", "Loved it" and "Watched" each put the title on, or take it
// off, their own list. Marking it Watched also takes it off Want to watch.
// Posters only get the first two, to keep them uncluttered.
export function SaveButtons({
  tmdbId,
  mediaType,
  title,
  posterPath,
  initial,
  variant = "buttons",
}: {
  tmdbId: number;
  mediaType: "tv" | "movie";
  title: string;
  posterPath: string | null;
  initial: Saved | null;
  variant?: "buttons" | "icons";
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<Saved>(initial ?? { want: false, loved: false, watched: false });
  const [busy, setBusy] = useState<ListName | null>(null);

  async function toggle(list: ListName) {
    const on = !saved[list];
    setBusy(list);
    const before = saved;
    setSaved((s) => ({ ...s, [list]: on, ...(list === "watched" && on ? { want: false } : {}) }));
    const res = on
      ? await fetch("/api/favorites", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tmdbId, mediaType, title, posterPath, list }),
        })
      : await fetch(`/api/favorites?type=${mediaType}&id=${tmdbId}&list=${list}`, { method: "DELETE" });
    if (!res.ok) setSaved(before);
    setBusy(null);
    router.refresh();
  }

  const options = [
    { value: "want" as const, icon: BOOKMARK, on: "On Want to watch", off: "Want to watch", name: "Want to watch" },
    { value: "loved" as const, icon: HEART, on: "Loved it", off: "Loved it", name: "Loved" },
    { value: "watched" as const, icon: CHECK, on: "Watched", off: "Watched it", name: "Watched" },
  ];

  if (variant === "icons") {
    return (
      <div className="flex flex-col gap-1">
        {options.slice(0, 2).map((o) => (
          <button
            key={o.value}
            onClick={() => toggle(o.value)}
            disabled={busy === o.value}
            aria-pressed={saved[o.value]}
            aria-label={saved[o.value] ? `Remove ${title} from ${o.name}` : `Add ${title} to ${o.name}`}
            title={saved[o.value] ? `On ${o.name}` : `Add to ${o.name}`}
            className={`grid h-8 w-8 place-items-center rounded-full bg-night/80 backdrop-blur transition ${saved[o.value] ? "text-marquee" : "text-paper hover:text-marquee"}`}
          >
            <Icon d={o.icon} filled={saved[o.value]} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => toggle(o.value)}
          disabled={busy === o.value}
          aria-pressed={saved[o.value]}
          className={saved[o.value] ? "btn-primary" : "btn-quiet"}
        >
          <Icon d={o.icon} filled={saved[o.value]} />
          {saved[o.value] ? o.on : o.off}
        </button>
      ))}
    </div>
  );
}
