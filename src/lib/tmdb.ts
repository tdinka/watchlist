// Everything we know about titles comes from TMDB (themoviedb.org).
// Where-to-watch data inside TMDB is provided by JustWatch, which must be
// credited wherever it's shown (see the footer in app/layout.tsx).

const BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

export const REGION = process.env.WATCH_REGION || "US";

export type MediaType = "movie" | "tv";

export function isMediaType(value: unknown): value is MediaType {
  return value === "movie" || value === "tv";
}

export function hasTmdbKey() {
  return Boolean(process.env.TMDB_API_KEY);
}

type Params = Record<string, string | number | boolean | undefined>;

// `revalidate` is how many seconds Next.js may reuse a cached answer.
// `fresh: true` always asks TMDB again (used by the daily new-episode check).
export async function tmdb<T = any>(
  path: string,
  params: Params = {},
  opts: { revalidate?: number; fresh?: boolean } = {},
): Promise<T> {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is not set");

  const url = new URL(BASE + path);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(name, String(value));
  }
  const headers: Record<string, string> = { accept: "application/json" };
  // TMDB hands out two kinds of key: a long "read access token" (starts with
  // eyJ) and a short "API key". Either works.
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);

  const res = await fetch(url, {
    headers,
    ...(opts.fresh ? { cache: "no-store" as const } : { next: { revalidate: opts.revalidate ?? 3600 } }),
  });
  if (!res.ok) throw new Error(`TMDB answered ${res.status} for ${path}`);
  return res.json();
}

export function imageUrl(path: string | null | undefined, size: "w92" | "w185" | "w342" | "w780" | "w1280" = "w342") {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

// ---- Titles ---------------------------------------------------------------

export type TitleSummary = {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  year: string | null;
  overview: string;
  rating: number | null;
  genreIds: number[];
  popularity: number;
};

// Turns one TMDB search/discover result into our shape. Returns null for
// people (search results mix in actors) and anything without a type.
export function toSummary(raw: any, fallbackType?: MediaType): TitleSummary | null {
  const mediaType = raw?.media_type ?? fallbackType;
  if (!isMediaType(mediaType)) return null;
  const date: string | undefined = mediaType === "movie" ? raw.release_date : raw.first_air_date;
  return {
    id: raw.id,
    mediaType,
    title: (mediaType === "movie" ? raw.title : raw.name) ?? "Untitled",
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    year: date ? date.slice(0, 4) : null,
    overview: raw.overview ?? "",
    rating: raw.vote_count > 20 ? Math.round(raw.vote_average * 10) / 10 : null,
    genreIds: raw.genre_ids ?? (raw.genres ?? []).map((g: any) => g.id),
    popularity: raw.popularity ?? 0,
  };
}

export function summaries(results: any[] | undefined, fallbackType?: MediaType): TitleSummary[] {
  return (results ?? []).map((r) => toSummary(r, fallbackType)).filter((t): t is TitleSummary => t !== null);
}

export async function searchTitles(query: string, page = 1) {
  const data = await tmdb("/search/multi", { query, page, include_adult: false, language: "en-US" }, { revalidate: 3600 });
  return { results: summaries(data.results), totalPages: data.total_pages as number };
}

export type DiscoverOptions = {
  mediaType: MediaType;
  providerIds: number[];
  genreId?: number;
  sort?: "popular" | "top" | "newest";
  page?: number;
  releasedAfter?: string; // yyyy-mm-dd
};

// Titles that are streaming on any of the given services in our region.
export async function discover(opts: DiscoverOptions) {
  const dateField = opts.mediaType === "movie" ? "primary_release_date" : "first_air_date";
  const today = new Date().toISOString().slice(0, 10);
  const sortBy =
    opts.sort === "top" ? "vote_average.desc" : opts.sort === "newest" ? `${dateField}.desc` : "popularity.desc";
  const data = await tmdb(
    `/discover/${opts.mediaType}`,
    {
      watch_region: REGION,
      with_watch_providers: opts.providerIds.join("|"),
      with_watch_monetization_types: "flatrate|ads|free",
      with_genres: opts.genreId,
      sort_by: sortBy,
      // Keeps "top rated" from being won by titles with three votes, and
      // "newest" from showing things that haven't come out yet.
      "vote_count.gte": opts.sort === "top" ? 300 : opts.sort === "newest" ? 5 : undefined,
      [`${dateField}.lte`]: opts.sort === "newest" || opts.releasedAfter ? today : undefined,
      [`${dateField}.gte`]: opts.releasedAfter,
      include_adult: false,
      language: "en-US",
      page: opts.page ?? 1,
    },
    { revalidate: 3 * 3600 },
  );
  return { results: summaries(data.results, opts.mediaType), totalPages: Math.min(data.total_pages ?? 1, 500) };
}

export async function getGenres(mediaType: MediaType): Promise<{ id: number; name: string }[]> {
  const data = await tmdb(`/genre/${mediaType}/list`, { language: "en-US" }, { revalidate: 7 * 86400 });
  return data.genres ?? [];
}

export async function getRecommendations(mediaType: MediaType, id: number) {
  const data = await tmdb(`/${mediaType}/${id}/recommendations`, { language: "en-US" }, { revalidate: 86400 });
  return summaries(data.results, mediaType);
}

// ---- Trailers -------------------------------------------------------------

export type Trailer = { key: string; name: string };

// TMDB lists a title's videos (trailers, teasers, clips, featurettes...) with
// links to YouTube. Pick the best one to show as a preview: an official
// trailer if there is one, then a teaser, then a scene from it. Interviews and
// behind-the-scenes videos aren't previews, so they're left out.
const PREVIEW_RANK: Record<string, number> = { Trailer: 0, Teaser: 1, Clip: 2 };

export function pickTrailer(videos: { results?: any[] } | undefined): Trailer | null {
  const rank = (v: any) => PREVIEW_RANK[v.type as string];
  const best = (videos?.results ?? [])
    .filter((v) => v.site === "YouTube" && v.key && rank(v) !== undefined && (!v.iso_639_1 || v.iso_639_1 === "en"))
    .sort((a, b) => rank(a) - rank(b) || Number(b.official) - Number(a.official) || (b.published_at ?? "").localeCompare(a.published_at ?? ""))[0];
  return best ? { key: best.key, name: best.name } : null;
}

// Shows often only have trailers on their latest season, so look there too.
export async function getTrailer(mediaType: MediaType, id: number, known?: { videos?: any; latestSeason?: number }): Promise<Trailer | null> {
  const videos = known?.videos ?? (await tmdb(`/${mediaType}/${id}/videos`, { language: "en-US" }, { revalidate: 86400 }));
  const found = pickTrailer(videos);
  if (found || mediaType === "movie") return found;
  let season = known?.latestSeason;
  if (season === undefined) season = (await tmdb(`/tv/${id}`, { language: "en-US" }, { revalidate: 6 * 3600 })).number_of_seasons;
  if (!season) return null;
  try {
    return pickTrailer(await tmdb(`/tv/${id}/season/${season}/videos`, { language: "en-US" }, { revalidate: 86400 }));
  } catch {
    return null;
  }
}

// ---- Where to watch -------------------------------------------------------

export type Provider = { id: number; name: string; logoPath: string | null; priority: number };

export type Availability = {
  link: string | null; // TMDB's where-to-watch page for this title
  stream: Provider[]; // included with a subscription (or free with ads)
  rent: Provider[];
  buy: Provider[];
};

function toProvider(raw: any): Provider {
  return {
    id: raw.provider_id,
    name: raw.provider_name,
    logoPath: raw.logo_path ?? null,
    priority: raw.display_priorities?.[REGION] ?? raw.display_priority ?? 999,
  };
}

function uniqueProviders(list: any[]): Provider[] {
  const seen = new Map<number, Provider>();
  for (const raw of list) if (!seen.has(raw.provider_id)) seen.set(raw.provider_id, toProvider(raw));
  return Array.from(seen.values()).sort((a, b) => a.priority - b.priority);
}

export function parseAvailability(raw: any): Availability {
  const r = raw?.results?.[REGION];
  if (!r) return { link: null, stream: [], rent: [], buy: [] };
  return {
    link: r.link ?? null,
    stream: uniqueProviders([...(r.flatrate ?? []), ...(r.ads ?? []), ...(r.free ?? [])]),
    rent: uniqueProviders(r.rent ?? []),
    buy: uniqueProviders(r.buy ?? []),
  };
}

export async function getAvailability(mediaType: MediaType, id: number, opts: { fresh?: boolean } = {}) {
  const data = await tmdb(`/${mediaType}/${id}/watch/providers`, {}, { revalidate: 6 * 3600, fresh: opts.fresh });
  return parseAvailability(data);
}

// Every streaming service TMDB knows about in our region, most popular first.
export async function getProviderCatalog(): Promise<Provider[]> {
  const [movie, tv] = await Promise.all([
    tmdb("/watch/providers/movie", { watch_region: REGION, language: "en-US" }, { revalidate: 86400 }),
    tmdb("/watch/providers/tv", { watch_region: REGION, language: "en-US" }, { revalidate: 86400 }),
  ]);
  return uniqueProviders([...(movie.results ?? []), ...(tv.results ?? [])]);
}

// Runs `fn` over `items` a few at a time so we don't fire hundreds of TMDB
// requests at once.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
