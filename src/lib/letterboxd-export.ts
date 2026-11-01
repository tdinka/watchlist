// Reads the data export Letterboxd gives you (Settings → Data → Export your
// data): a .zip of CSV files. Runs in the browser, so the file never leaves
// the device; only film names, years and what you did with them are sent on.
//   watched.csv           every film you've logged as watched
//   ratings.csv           your star ratings (0.5 to 5)
//   likes/films.csv       films you hearted
//   watchlist.csv         your Letterboxd watchlist
// Safari unzips downloads by itself, so the loose CSV files work too.

import { unzipSync, strFromU8 } from "fflate";
import { splitCsvLine } from "@/lib/netflix";

export type LetterboxdFilm = { name: string; year: number | null; watched: boolean; loved: boolean; want: boolean };

type Kind = "watched" | "ratings" | "likes" | "watchlist";

function kindOf(path: string): Kind | null {
  const p = path.toLowerCase().replace(/\\/g, "/");
  if (p.includes("__macosx/") || p.includes("/deleted/") || p.includes("/orphaned/")) return null;
  if (p.endsWith("likes/films.csv") || p === "films.csv") return "likes";
  const file = p.split("/").pop();
  if (file === "watched.csv" || file === "ratings.csv" || file === "watchlist.csv") return file.replace(".csv", "") as Kind;
  return null;
}

function rowsOf(text: string) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsvLine(lines[0] ?? "").map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const get = (name: string) => (col(name) === -1 ? "" : (cells[col(name)] ?? "").trim());
    return { name: get("name"), year: Number(get("year")) || null, uri: get("letterboxd uri"), rating: Number(get("rating")) || 0 };
  });
}

// One entry per film, from any mix of a .zip and loose CSV files.
export async function readLetterboxdExport(files: File[]): Promise<LetterboxdFilm[]> {
  const texts: { kind: Kind; text: string }[] = [];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      const unzipped = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => kindOf(f.name) !== null });
      for (const [path, data] of Object.entries(unzipped)) texts.push({ kind: kindOf(path)!, text: strFromU8(data) });
    } else {
      const kind = kindOf(file.webkitRelativePath || file.name);
      if (kind) texts.push({ kind, text: await file.text() });
    }
  }
  if (texts.length === 0) throw new Error("No Letterboxd files found. Choose the .zip from Letterboxd, or watched.csv, ratings.csv and watchlist.csv.");

  const films = new Map<string, LetterboxdFilm>();
  for (const { kind, text } of texts) {
    for (const row of rowsOf(text)) {
      if (!row.name) continue;
      const key = `${row.name.toLowerCase()}|${row.year ?? ""}`;
      const film = films.get(key) ?? { name: row.name, year: row.year, watched: false, loved: false, want: false };
      if (kind === "watchlist") film.want = true;
      else film.watched = true; // rating or liking a film counts as having seen it
      if (kind === "likes" || (kind === "ratings" && row.rating >= 4)) film.loved = true;
      films.set(key, film);
    }
  }
  // Already seen it? Then it isn't one to watch.
  return Array.from(films.values(), (f) => ({ ...f, want: f.want && !f.watched }));
}
