"use client";

import { useEffect, useState } from "react";
import type { MediaType, Trailer } from "@/lib/tmdb";

function PlayIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

// The video player, over the page. Closes with ✕, Escape or a click outside.
function TrailerPlayer({ title, trailer, state, onClose }: { title: string; trailer: Trailer | null; state: "loading" | "ready" | "none" | "error"; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal aria-label={`Trailer for ${title}`} className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="truncate font-medium">{trailer?.name ?? title}</p>
          <button onClick={onClose} className="btn-quiet" aria-label="Close trailer">
            ✕
          </button>
        </div>
        <div className="grid aspect-video w-full place-items-center overflow-hidden rounded-xl bg-night-raised">
          {state === "ready" && trailer ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0`}
              title={trailer.name}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="h-full w-full"
            />
          ) : (
            <p className="p-6 text-center text-paper-muted">
              {state === "loading" ? "Finding the trailer…" : state === "none" ? `No trailer for ${title} yet.` : "Couldn't load the trailer. Try again in a moment."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// "Play trailer" button for a title page, where the trailer is already known.
export function TrailerButton({ title, trailer }: { title: string; trailer: Trailer }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-quiet">
        <PlayIcon />
        Play trailer
      </button>
      {open && <TrailerPlayer title={title} trailer={trailer} state="ready" onClose={() => setOpen(false)} />}
    </>
  );
}

// Small play button on a poster. Looks the trailer up only when pressed.
export function TrailerIcon({ title, mediaType, tmdbId }: { title: string; mediaType: MediaType; tmdbId: number }) {
  const [open, setOpen] = useState(false);
  const [trailer, setTrailer] = useState<Trailer | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none" | "error">("loading");

  async function play() {
    setOpen(true);
    if (state === "ready" || state === "none") return;
    setState("loading");
    try {
      const res = await fetch(`/api/trailer?type=${mediaType}&id=${tmdbId}`);
      if (!res.ok) throw new Error();
      const { trailer } = (await res.json()) as { trailer: Trailer | null };
      setTrailer(trailer);
      setState(trailer ? "ready" : "none");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button
        onClick={play}
        aria-label={`Play trailer for ${title}`}
        title="Play trailer"
        className="grid h-8 w-8 place-items-center rounded-full bg-night/80 text-paper backdrop-blur transition hover:text-marquee"
      >
        <PlayIcon />
      </button>
      {open && <TrailerPlayer title={title} trailer={trailer} state={state} onClose={() => setOpen(false)} />}
    </>
  );
}
