import { db } from "@/lib/db";
import { addFavorites, type FavoriteInput } from "@/lib/favorites";
import { normalizeTitle } from "@/lib/matching";
import { mapLimit, tmdb } from "@/lib/tmdb";

// Letterboxd is films only. Two ways in:
//  - the data export (whole history), read in the browser by
//    letterboxd-export.ts and matched here by name and year;
//  - the public activity feed letterboxd.com/<user>/rss/ (the latest ~50
//    diary entries, with TMDB ids), read by the daily check.
// Watched → Watched; hearted or rated 4★+ → Loved; Letterboxd watchlist →
// Want to watch (unless already watched).

export type FilmLog = FavoriteInput & { watched: boolean; loved: boolean; want: boolean };

export async function applyFilmLog(user: { id: string; householdId: string }, films: FilmLog[]) {
  const pick = (f: FilmLog): FavoriteInput => ({ tmdbId: f.tmdbId, mediaType: "movie", title: f.title, posterPath: f.posterPath });
  const watched = await addFavorites(user, films.filter((f) => f.watched).map(pick), "watched");
  const loved = await addFavorites(user, films.filter((f) => f.loved).map(pick), "loved");
  const already = await db.favorite.findMany({
    where: { userId: user.id, list: "watched", mediaType: "movie", tmdbId: { in: films.map((f) => f.tmdbId) } },
    select: { tmdbId: true },
  });
  const seen = new Set(already.map((f) => f.tmdbId));
  const want = await addFavorites(user, films.filter((f) => f.want && !f.watched && !seen.has(f.tmdbId)).map(pick), "want");
  return { watched, loved, want };
}

// Finds the TMDB film for a Letterboxd name and year. Letterboxd and TMDB
// sometimes disagree on the year by one, so that's allowed as a fallback.
export async function findFilm(name: string, year: number | null) {
  const search = async (params: Record<string, string | number | undefined>) =>
    ((await tmdb("/search/movie", { query: name, include_adult: false, language: "en-US", ...params }, { revalidate: 7 * 86400 })).results ??
      []) as any[];
  const wanted = normalizeTitle(name);
  const yearOf = (r: any) => Number((r.release_date ?? "").slice(0, 4)) || null;
  const sameName = (r: any) => normalizeTitle(r.title ?? "") === wanted || normalizeTitle(r.original_title ?? "") === wanted;

  let results = await search({ primary_release_year: year ?? undefined });
  let best = results.find(sameName) ?? (year ? results[0] : undefined);
  if (!best && year) {
    results = await search({});
    best = results.find((r) => sameName(r) && yearOf(r) && Math.abs(yearOf(r)! - year) <= 1);
  }
  return best ? { tmdbId: best.id as number, title: (best.title as string) ?? name, posterPath: (best.poster_path as string | null) ?? null } : null;
}

export async function matchFilms(films: { name: string; year: number | null; watched: boolean; loved: boolean; want: boolean }[]) {
  const found = await mapLimit(films, 8, async (f) => {
    try {
      const film = await findFilm(f.name, f.year);
      return film ? { ...f, ...film, mediaType: "movie" as const } : null;
    } catch {
      return null;
    }
  });
  return {
    matched: found.filter((f): f is NonNullable<typeof f> => f !== null),
    unmatched: films.filter((_, i) => !found[i]).map((f) => (f.year ? `${f.name} (${f.year})` : f.name)),
  };
}

// ---- Activity feed ----------------------------------------------------------

export function isLetterboxdUsername(value: string) {
  return /^[A-Za-z0-9_]{1,40}$/.test(value);
}

type FeedEntry = { tmdbId: number; title: string; at: Date; rating: number; liked: boolean };

function tag(item: string, name: string) {
  const m = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() : "";
}

export function parseFeed(xml: string): FeedEntry[] {
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).flatMap(([, item]) => {
    const tmdbId = Number(tag(item, "tmdb:movieId"));
    const at = new Date(tag(item, "pubDate"));
    // Lists and other activity have no film id; only diary entries do.
    if (!tmdbId || Number.isNaN(at.getTime())) return [];
    return [
      {
        tmdbId,
        title: tag(item, "letterboxd:filmTitle") || "Untitled",
        at,
        rating: Number(tag(item, "letterboxd:memberRating")) || 0,
        liked: tag(item, "letterboxd:memberLike") === "Yes",
      },
    ];
  });
}

export async function fetchFeed(username: string) {
  const res = await fetch(`https://letterboxd.com/${encodeURIComponent(username)}/rss/`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; Watchlist personal app)", accept: "application/rss+xml" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) throw new Error(`There's no Letterboxd member called ${username}.`);
  if (!res.ok) throw new Error(`Letterboxd answered ${res.status}.`);
  return parseFeed(await res.text());
}

// Brings in diary entries newer than the last sync. Entries already brought
// in aren't applied again, so taking a film off Loved here sticks.
export async function syncLetterboxd(user: { id: string; householdId: string; letterboxdUser: string | null; letterboxdSyncedAt: Date | null }) {
  if (!user.letterboxdUser) return { watched: 0, loved: 0, want: 0 };
  const since = user.letterboxdSyncedAt?.getTime() ?? 0;
  const entries = (await fetchFeed(user.letterboxdUser)).filter((e) => e.at.getTime() > since);
  if (entries.length === 0) return { watched: 0, loved: 0, want: 0 };

  const posters = new Map(
    await mapLimit(Array.from(new Set(entries.map((e) => e.tmdbId))), 6, async (id): Promise<[number, string | null]> => {
      try {
        return [id, (await tmdb(`/movie/${id}`, { language: "en-US" }, { revalidate: 7 * 86400 })).poster_path ?? null];
      } catch {
        return [id, null];
      }
    }),
  );
  const films = new Map<number, FilmLog>();
  for (const e of entries) {
    const film = films.get(e.tmdbId) ?? { tmdbId: e.tmdbId, mediaType: "movie" as const, title: e.title, posterPath: posters.get(e.tmdbId) ?? null, watched: true, loved: false, want: false };
    if (e.liked || e.rating >= 4) film.loved = true;
    films.set(e.tmdbId, film);
  }
  const added = await applyFilmLog(user, Array.from(films.values()));
  const newest = new Date(Math.max(...entries.map((e) => e.at.getTime())));
  await db.user.update({ where: { id: user.id }, data: { letterboxdSyncedAt: newest } });
  return added;
}

// For the daily check: every connected person (in one household, if given).
export async function syncAllLetterboxd(householdId?: string) {
  const users = await db.user.findMany({ where: { letterboxdUser: { not: null }, ...(householdId ? { householdId } : {}) } });
  const errors: string[] = [];
  let films = 0;
  for (const user of users) {
    try {
      const added = await syncLetterboxd(user);
      films += added.watched + added.loved + added.want;
    } catch (err) {
      errors.push(`Letterboxd ${user.letterboxdUser}: ${(err as Error).message}`);
    }
  }
  return { people: users.length, films, errors };
}
