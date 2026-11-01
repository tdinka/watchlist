"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ListName, Saved } from "@/lib/favorites";
import type { MatchQuery, MatchResult } from "@/lib/matching";
import { groupHistory, parseNetflixCsv, parsePastedList } from "@/lib/netflix";
import { imageUrl } from "@/lib/tmdb";
import { LetterboxdImport } from "./LetterboxdImport";

const MAX_TITLES = 250;

type Source = "netflix" | "list" | "letterboxd";
type Row = MatchResult & { pick: number; on: boolean }; // pick = which candidate; -1 = none fit

function formatMonth(date: string | null | undefined) {
  if (!date) return null;
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function ImportClient({ letterboxd }: { letterboxd: { username: string | null; syncedAt: string | null } }) {
  const [source, setSource] = useState<Source>("netflix");
  // /import?source=letterboxd opens that tab (read directly: see CLAUDE.md on useSearchParams).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("source") === "letterboxd") setSource("letterboxd");
  }, []);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saved, setSaved] = useState<Record<string, Saved>>({});
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  // A Netflix history is what you've watched, so it goes to Loved; a typed
  // list can be either.
  const [target, setTarget] = useState<ListName>("loved");

  async function match(all: MatchQuery[], from: Source) {
    const queries = all.filter((q) => q.query.trim());
    if (queries.length === 0) {
      setError(from === "netflix" ? "No titles found in that file." : "Type at least one title.");
      return;
    }
    const total = queries.length;
    const items = queries.slice(0, MAX_TITLES);
    setNote(total > MAX_TITLES ? `You've watched ${total} different titles. Here are your ${MAX_TITLES} most-watched.` : null);
    setBusy(`Finding ${items.length} title${items.length === 1 ? "" : "s"}…`);
    setError(null);
    const res = await fetch("/api/import/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Couldn't look those up. Try again in a minute.");
      return;
    }
    const data: { results: MatchResult[]; saved: Record<string, Saved>; skipped?: number } = await res.json();
    if (data.skipped) {
      setNote((n) => [n, `${data.skipped} line${data.skipped === 1 ? "" : "s"} couldn't be read and ${data.skipped === 1 ? "was" : "were"} skipped.`].filter(Boolean).join(" "));
    }
    setSaved(data.saved);
    // Only the list being added to counts: a Loved title can still go on Want to watch.
    const list: ListName = from === "netflix" ? "loved" : target;
    setRows(
      data.results.map((r) => {
        const best = r.candidates[0];
        const already = best ? Boolean(data.saved[`${best.mediaType}:${best.id}`]?.[list]) : false;
        // From Netflix, tick shows you watched at least 3 episodes of; movies
        // you watched once might not be ones you loved, so they start unticked.
        // A typed list is things you chose, so everything starts ticked.
        const on = Boolean(best) && !already && (from === "list" || (r.kind === "tv" && (r.count ?? 0) >= 3));
        return { ...r, pick: best ? 0 : -1, on };
      }),
    );
  }

  async function onFile(file: File) {
    setError(null);
    setRows(null);
    setAdded(null);
    try {
      await match(groupHistory(parseNetflixCsv(await file.text())), "netflix");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const chosen = useMemo(() => (rows ?? []).filter((r) => r.on && r.pick >= 0), [rows]);

  async function addChosen() {
    setBusy(`Adding ${chosen.length}…`);
    const items = chosen.map((r) => {
      const t = r.candidates[r.pick];
      return { tmdbId: t.id, mediaType: t.mediaType, title: t.title, posterPath: t.posterPath };
    });
    const res = await fetch("/api/favorites/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items, list: source === "netflix" ? "loved" : target }),
    });
    setBusy(null);
    if (!res.ok) {
      setError("Couldn't add them. Try again.");
      return;
    }
    setAdded((await res.json()).added);
    setRows(null);
    setText("");
  }

  const update = (i: number, change: Partial<Row>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...change } : r)));

  if (added !== null) {
    return (
      <div className="card mt-6 p-6">
        <h2 className="text-xl font-bold">
          Added {added} to {source === "list" && target === "want" ? "Want to watch" : "Loved"}
        </h2>
        <p className="mt-1 text-paper-muted">
          {source === "list" && target === "want"
            ? "You'll hear when they arrive on your services or get new seasons."
            : "You'll get alerts for new episodes from now on, and your recommendations now know your taste."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/for-you" className="btn-primary">
            See recommendations
          </Link>
          <Link href={`/favorites?list=${source === "list" ? target : "loved"}`} className="btn-quiet">
            View the list
          </Link>
          <button className="btn-quiet" onClick={() => setAdded(null)}>
            Import more
          </button>
        </div>
      </div>
    );
  }

  if (rows) {
    return (
      <div className="mt-6">
        {note && <p className="mb-3 text-sm text-paper-muted">{note}</p>}
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-paper-muted">Tick what to add. If the guess is wrong, choose another match.</span>
          <button className="text-marquee underline" onClick={() => setRows(rows.map((r) => ({ ...r, on: r.pick >= 0 })))}>
            Tick all
          </button>
          <button className="text-marquee underline" onClick={() => setRows(rows.map((r) => ({ ...r, on: false })))}>
            Untick all
          </button>
        </div>
        <ul className="card divide-y divide-night-line">
          {rows.map((r, i) => {
            const t = r.pick >= 0 ? r.candidates[r.pick] : null;
            const already = t ? Boolean(saved[`${t.mediaType}:${t.id}`]?.[source === "netflix" ? "loved" : target]) : false;
            const poster = imageUrl(t?.posterPath, "w92");
            const watched =
              r.count && r.kind === "tv"
                ? `${r.count} episode${r.count === 1 ? "" : "s"} watched`
                : r.count && r.count > 1
                  ? `Watched ${r.count} times`
                  : null;
            const last = formatMonth(r.lastWatched);
            return (
              <li key={i} className={`flex items-center gap-3 p-3 ${t ? "" : "opacity-60"}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-[#F4B740]"
                  checked={r.on && !!t && !already}
                  disabled={!t || already}
                  onChange={(e) => update(i, { on: e.target.checked })}
                  aria-label={`Add ${t?.title ?? r.query}`}
                />
                {poster ? <img src={poster} alt="" className="h-14 w-10 shrink-0 rounded object-cover" /> : <div className="h-14 w-10 shrink-0 rounded bg-night-raised" />}
                <div className="min-w-0 flex-1">
                  {t ? (
                    <p className="font-medium">
                      {t.title}{" "}
                      <span className="text-sm font-normal text-paper-faint">
                        {t.mediaType === "tv" ? "Series" : "Movie"}
                        {t.year ? ` · ${t.year}` : ""}
                      </span>
                    </p>
                  ) : (
                    <p className="font-medium">Couldn&apos;t find &ldquo;{r.query}&rdquo;</p>
                  )}
                  <p className="text-xs text-paper-muted">
                    {[t && t.title.toLowerCase() !== r.query.toLowerCase() ? `From “${r.query}”` : null, watched, last ? `last ${last}` : null, already ? `already on ${source === "list" && target === "want" ? "Want to watch" : "Loved"}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {r.candidates.length > 1 && (
                  <select
                    className="input w-auto max-w-[11rem] shrink py-1 text-xs"
                    value={r.pick}
                    onChange={(e) => {
                      const pick = Number(e.target.value);
                      update(i, { pick, on: pick >= 0 });
                    }}
                    aria-label={`Other matches for ${r.query}`}
                  >
                    {r.candidates.map((c, ci) => (
                      <option key={ci} value={ci}>
                        {c.title} ({c.mediaType === "tv" ? "series" : "movie"}
                        {c.year ? `, ${c.year}` : ""})
                      </option>
                    ))}
                    <option value={-1}>None of these</option>
                  </select>
                )}
              </li>
            );
          })}
        </ul>
        {error && <p className="mt-3 text-sm text-flare">{error}</p>}
        <div className="sticky bottom-20 mt-4 flex items-center gap-3 rounded-xl border border-night-line bg-night-surface/95 p-3 backdrop-blur md:bottom-4">
          <button className="btn-primary" disabled={chosen.length === 0 || !!busy} onClick={addChosen}>
            {busy ?? `Add ${chosen.length} to ${source === "list" && target === "want" ? "Want to watch" : "Loved"}`}
          </button>
          <button className="text-sm text-paper-muted hover:text-paper" onClick={() => setRows(null)}>
            Start over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex gap-2">
        {(["netflix", "letterboxd", "list"] as const).map((s) => (
          <button key={s} className={`chip ${source === s ? "chip-on" : ""}`} onClick={() => (setSource(s), setError(null))}>
            {s === "netflix" ? "From Netflix" : s === "letterboxd" ? "From Letterboxd" : "Type a list"}
          </button>
        ))}
      </div>

      {source === "letterboxd" ? (
        <LetterboxdImport username={letterboxd.username} syncedAt={letterboxd.syncedAt} />
      ) : source === "netflix" ? (
        <div className="card mt-4 p-5">
          <h2 className="text-lg font-bold">Your Netflix viewing history</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-paper-muted">
            <li>
              On a computer, open{" "}
              <a href="https://www.netflix.com/viewingactivity" target="_blank" rel="noreferrer" className="text-marquee underline">
                netflix.com/viewingactivity
              </a>{" "}
              (it asks which profile).
            </li>
            <li>
              Scroll to the bottom and click <span className="text-paper">Download all</span>. You get a file called
              NetflixViewingHistory.csv.
            </li>
            <li>Choose that file below. It&apos;s read on this device; only the show and movie names are looked up.</li>
            <li>What you pick goes on your Loved list, since you&apos;ve watched it.</li>
          </ol>
          <label className="btn-primary mt-4 cursor-pointer">
            {busy ?? "Choose the file"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={!!busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFile(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : (
        <div className="card mt-4 p-5">
          <h2 className="text-lg font-bold">Type titles, one per line</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-paper-muted">Add them to:</span>
            {(["want", "loved"] as const).map((l) => (
              <button key={l} type="button" className={`chip ${target === l ? "chip-on" : ""}`} onClick={() => setTarget(l)}>
                {l === "want" ? "Want to watch" : "Loved (already watched)"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-paper-muted">Good for HBO Max, Prime Video, Apple TV, or anything from memory.</p>
          <textarea
            className="input mt-3 h-48 font-body"
            placeholder={"The Bear\nSuccession\nSlow Horses\nDune: Part Two"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn-primary mt-3" disabled={!!busy || !text.trim()} onClick={() => match(parsePastedList(text), "list")}>
            {busy ?? "Find these"}
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-flare">{error}</p>}
    </div>
  );
}
