// Reads the viewing-history file Netflix gives you (Account → Profiles →
// Viewing activity → Download all): a CSV with "Title" and "Date" columns.
// Episodes look like "The Crown: Season 2: Misadventure"; movies are just
// their title. Runs in the browser, so the file never leaves the device;
// only the grouped show and movie names are sent to the server.

import type { MatchQuery } from "@/lib/matching";

// A part of the title that means "what comes before me is the show's name".
const MARKER = /^(season|series|part|volume|vol\.?|chapter|book|collection|limited series|miniseries|episode|staffel|temporada|saison)\b/i;

// Splits one CSV line, allowing quoted fields with commas and "" inside.
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") out.push(field), (field = "");
    else field += c;
  }
  out.push(field);
  return out;
}

// Netflix writes US dates like 10/24/26; some regions get 24/10/2026 or 2026-10-24.
function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (!m) return null;
  let [a, b] = [Number(m[1]), Number(m[2])];
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (a > 12) [a, b] = [b, a]; // day came first
  return `${year}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
}

export type HistoryRow = { title: string; date: string | null };

export function parseNetflixCsv(text: string): HistoryRow[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const titleCol = header.indexOf("title");
  // The full data download (ViewingActivity.csv) says "Start Time" and also
  // lists trailers and previews, marked in "Supplemental Video Type".
  const dateCol = header.indexOf("date") !== -1 ? header.indexOf("date") : header.indexOf("start time");
  const extraCol = header.indexOf("supplemental video type");
  if (titleCol === -1) throw new Error("This doesn't look like a Netflix viewing history file (no Title column).");
  return lines.slice(1).flatMap((line) => {
    const cells = splitCsvLine(line);
    const title = (cells[titleCol] ?? "").trim();
    if (!title || (extraCol !== -1 && (cells[extraCol] ?? "").trim())) return [];
    return [{ title, date: dateCol === -1 ? null : toIsoDate(cells[dateCol] ?? "") }];
  });
}

// Turns history rows into one entry per show or movie, most-watched first.
export function groupHistory(rows: HistoryRow[]): MatchQuery[] {
  type Group = { query: string; kind?: "tv"; count: number; lastWatched: string | null; titles: Set<string> };
  const groups = new Map<string, Group>();
  const add = (rawName: string, kind: "tv" | undefined, row: HistoryRow) => {
    const name = rawName.trim() || row.title; // never a blank name (a title starting with ": ")
    const key = name.toLowerCase();
    const g = groups.get(key) ?? { query: name, kind, count: 0, lastWatched: null, titles: new Set<string>() };
    g.count++;
    g.titles.add(row.title);
    if (kind) g.kind = kind;
    if (row.date && (!g.lastWatched || row.date > g.lastWatched)) g.lastWatched = row.date;
    groups.set(key, g);
  };

  for (const row of rows) {
    const parts = row.title.split(": ");
    // Some seasons are named after the show: "Stranger Things: Stranger Things 4: Chapter One".
    const markerAt = parts.findIndex(
      (p, i) => i > 0 && (MARKER.test(p) || (p.startsWith(parts[0] + " ") && /^\d+$/.test(p.slice(parts[0].length + 1)))),
    );
    if (markerAt > 0) add(parts.slice(0, markerAt).join(": "), "tv", row);
    // "Show: Episode name" without a season: treat the first part as the show
    // for now; if it only ever appears once it goes back to being a movie
    // title with a colon in it (like "Mission: Impossible").
    else if (parts.length >= 2) add(parts[0], undefined, row);
    else add(row.title, undefined, row);
  }

  const result: MatchQuery[] = [];
  for (const g of Array.from(groups.values())) {
    if (!g.kind && g.titles.size === 1) {
      const only = Array.from(g.titles)[0];
      result.push({ query: only, count: g.count, lastWatched: g.lastWatched });
    } else {
      result.push({ query: g.query, kind: g.kind ?? (g.titles.size > 1 ? "tv" : undefined), count: g.count, lastWatched: g.lastWatched });
    }
  }
  return result.sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || (b.lastWatched ?? "").localeCompare(a.lastWatched ?? ""));
}

// A pasted list: one title per line, ignoring blanks, bullets and numbering.
export function parsePastedList(text: string): MatchQuery[] {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => {
      const key = l.toLowerCase();
      if (!l || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((query) => ({ query }));
}
