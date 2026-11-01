"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { readLetterboxdExport } from "@/lib/letterboxd-export";

const BATCH = 100;

type Counts = { watched: number; loved: number; want: number };

function describe(c: Counts) {
  const parts = [
    c.watched && `${c.watched} to Watched`,
    c.loved && `${c.loved} to Loved`,
    c.want && `${c.want} to Want to watch`,
  ].filter(Boolean);
  return parts.length ? `Added ${parts.join(", ")}.` : "Nothing new: those films were already on your lists.";
}

// The Letterboxd tab on the Import page: the export file for your whole
// history, and your username so the daily check brings in new films.
export function LetterboxdImport({ username, syncedAt }: { username: string | null; syncedAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ counts: Counts; unmatched: string[] } | null>(null);
  const [name, setName] = useState(username ?? "");
  const [feedNote, setFeedNote] = useState<string | null>(null);

  async function onFiles(files: File[]) {
    setError(null);
    setResult(null);
    let films;
    try {
      films = await readLetterboxdExport(files);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    const total: Counts = { watched: 0, loved: 0, want: 0 };
    const unmatched: string[] = [];
    for (let i = 0; i < films.length; i += BATCH) {
      setBusy(`Finding films… ${Math.min(i + BATCH, films.length)} of ${films.length}`);
      const res = await fetch("/api/import/letterboxd", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ films: films.slice(i, i + BATCH) }),
      });
      if (!res.ok) {
        setBusy(null);
        setError(`Stopped after ${i} of ${films.length} films: ${(await res.json().catch(() => null))?.error ?? "something went wrong"}. Choosing the file again carries on where it stopped.`);
        setResult({ counts: total, unmatched });
        return;
      }
      const data: { added: Counts; unmatched: string[] } = await res.json();
      total.watched += data.added.watched;
      total.loved += data.added.loved;
      total.want += data.added.want;
      unmatched.push(...data.unmatched);
    }
    setBusy(null);
    setResult({ counts: total, unmatched });
    router.refresh();
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setFeedNote(null);
    setBusy("Checking Letterboxd…");
    const res = await fetch("/api/letterboxd", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: name }) });
    const data = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setFeedNote(data?.error ?? "Couldn't reach Letterboxd. Try again in a minute.");
      return;
    }
    setName(data.username);
    setFeedNote(`Connected. ${describe(data.added)}`);
    router.refresh();
  }

  async function disconnect() {
    await fetch("/api/letterboxd", { method: "DELETE" });
    setName("");
    setFeedNote("Disconnected. Films already brought in stay on your lists.");
    router.refresh();
  }

  return (
    <>
      <div className="card mt-4 p-5">
        <h2 className="text-lg font-bold">1. Your whole Letterboxd history</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-paper-muted">
          <li>
            On Letterboxd, open{" "}
            <a href="https://letterboxd.com/settings/data/" target="_blank" rel="noreferrer" className="text-marquee underline">
              Settings → Data
            </a>{" "}
            and choose <span className="text-paper">Export your data</span>. You get a .zip file.
          </li>
          <li>Choose that file below (or, if your Mac unzipped it, the CSV files inside). It&apos;s read on this device.</li>
          <li>
            Films you&apos;ve seen go to <span className="text-paper">Watched</span>; ones you hearted or rated 4★ or more also go to{" "}
            <span className="text-paper">Loved</span>; your Letterboxd watchlist goes to <span className="text-paper">Want to watch</span>.
          </li>
        </ol>
        <label className="btn-primary mt-4 cursor-pointer">
          {busy?.startsWith("Finding") ? busy : "Choose the file"}
          <input
            type="file"
            accept=".zip,.csv,application/zip,text/csv"
            multiple
            className="sr-only"
            disabled={!!busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) onFiles(files);
              e.target.value = "";
            }}
          />
        </label>
        {result && (
          <div className="mt-4 text-sm">
            <p className="font-medium">{describe(result.counts)}</p>
            {result.unmatched.length > 0 && (
              <details className="mt-2 text-paper-muted">
                <summary className="cursor-pointer">
                  {result.unmatched.length} film{result.unmatched.length === 1 ? "" : "s"} couldn&apos;t be matched
                </summary>
                <p className="mt-1">{result.unmatched.slice(0, 200).join(" · ")}</p>
              </details>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/favorites?list=watched" className="btn-quiet">
                See Watched
              </Link>
              <Link href="/for-you" className="btn-quiet">
                See recommendations
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="card mt-4 p-5">
        <h2 className="text-lg font-bold">2. Keep it up to date</h2>
        <p className="mt-1 text-sm text-paper-muted">
          With your Letterboxd username, the daily check brings in films you log on Letterboxd from now on (from your public activity, the
          latest 50 or so).
        </p>
        <form onSubmit={connect} className="mt-3 flex flex-wrap gap-2">
          <input
            className="input w-56"
            placeholder="Letterboxd username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            aria-label="Letterboxd username"
          />
          <button className="btn-primary" disabled={!!busy || !name.trim()}>
            {busy === "Checking Letterboxd…" ? busy : username && name === username ? "Check now" : "Connect"}
          </button>
          {username && (
            <button type="button" className="btn-quiet" onClick={disconnect}>
              Disconnect
            </button>
          )}
        </form>
        <p className="mt-2 text-sm text-paper-muted">
          {feedNote ??
            (username
              ? `Connected as ${username}.${syncedAt ? ` Newest film brought in: ${new Date(syncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : ""}`
              : "Not connected.")}
        </p>
      </div>
      {error && <p className="mt-3 text-sm text-flare">{error}</p>}
    </>
  );
}
