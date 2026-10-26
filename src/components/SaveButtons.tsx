"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ListName } from "@/lib/favorites";

const HEART = "M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z";
const BOOKMARK = "M6 3h12v18l-6-4-6 4z";

function Icon({ d, filled }: { d: string; filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

// "Want to watch" and "Loved it". A title is on one list at most: tapping the
// other one moves it, tapping the active one takes it off.
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
  initial: ListName | null;
  variant?: "buttons" | "icons";
}) {
  const router = useRouter();
  const [list, setList] = useState<ListName | null>(initial);
  const [busy, setBusy] = useState(false);

  async function choose(target: ListName) {
    const before = list;
    const next = list === target ? null : target;
    setBusy(true);
    setList(next);
    const res = next
      ? await fetch("/api/favorites", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tmdbId, mediaType, title, posterPath, list: next }),
        })
      : await fetch(`/api/favorites?type=${mediaType}&id=${tmdbId}`, { method: "DELETE" });
    if (!res.ok) setList(before);
    setBusy(false);
    router.refresh();
  }

  const options = [
    { value: "want" as const, icon: BOOKMARK, on: "On Want to watch", off: "Want to watch", label: `Want to watch ${title}` },
    { value: "loved" as const, icon: HEART, on: "Loved it", off: "Loved it", label: `Loved ${title}` },
  ];

  if (variant === "icons") {
    return (
      <div className="flex flex-col gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => choose(o.value)}
            disabled={busy}
            aria-pressed={list === o.value}
            aria-label={list === o.value ? `Remove ${title} from ${o.value === "want" ? "Want to watch" : "Loved"}` : o.label}
            title={o.off}
            className={`grid h-8 w-8 place-items-center rounded-full bg-night/80 backdrop-blur transition ${list === o.value ? "text-marquee" : "text-paper hover:text-marquee"}`}
          >
            <Icon d={o.icon} filled={list === o.value} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} onClick={() => choose(o.value)} disabled={busy} aria-pressed={list === o.value} className={list === o.value ? "btn-primary" : "btn-quiet"}>
          <Icon d={o.icon} filled={list === o.value} />
          {list === o.value ? o.on : o.off}
        </button>
      ))}
    </div>
  );
}
