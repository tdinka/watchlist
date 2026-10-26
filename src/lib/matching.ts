import { mapLimit, summaries, tmdb, type MediaType, type TitleSummary } from "@/lib/tmdb";

export type MatchQuery = {
  query: string;
  kind?: MediaType; // when we already know it's a show (from Netflix's "Season 1" etc.)
  count?: number; // episodes or times watched
  lastWatched?: string | null; // yyyy-mm-dd
};

export type MatchResult = MatchQuery & { candidates: TitleSummary[] }; // best guess first

// "The Office (U.S.)" and "the office" should count as the same name.
export function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\(.*?\)/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^the /, "")
    .trim();
}

async function candidatesFor(q: MatchQuery): Promise<TitleSummary[]> {
  const path = q.kind ? `/search/${q.kind}` : "/search/multi";
  const data = await tmdb(path, { query: q.query, include_adult: false, language: "en-US" }, { revalidate: 86400 });
  const found = summaries(data.results, q.kind);
  // An exact name match beats TMDB's own order; among exact matches the
  // better-known one wins (the 2005 Office over a 1990s namesake).
  const wanted = normalizeTitle(q.query);
  const exact = found.filter((t) => normalizeTitle(t.title) === wanted).sort((a, b) => b.popularity - a.popularity);
  const rest = found.filter((t) => !exact.includes(t));
  return [...exact, ...rest].slice(0, 5);
}

export async function matchTitles(queries: MatchQuery[]): Promise<MatchResult[]> {
  return mapLimit(queries, 8, async (q) => {
    try {
      return { ...q, candidates: await candidatesFor(q) };
    } catch {
      return { ...q, candidates: [] };
    }
  });
}
