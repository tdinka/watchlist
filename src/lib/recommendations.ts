import { db } from "@/lib/db";
import { servicesForTitles } from "@/lib/services";
import { discover, getRecommendations, mapLimit, type MediaType, type Provider, type TitleSummary } from "@/lib/tmdb";

export type Recommendation = TitleSummary & { because: string | null; services: Provider[] };

// Suggestions built from TMDB's "people who liked this also liked" lists for
// each title on the Loved list (not Want to watch: those aren't known likes).
// A title suggested by several loved titles ranks higher. Only titles
// streaming on the household's services are kept.
//
// `round` is how many times someone has asked for different ones: each round
// takes the next stretch of the ranked list, so a new round never repeats the
// last one. Once the list runs out it starts over (`startedOver`).
export type RecommendationRound = { titles: Recommendation[]; round: number; startedOver: boolean };

const POPULAR_PAGES = 10;

export async function recommendFor(
  userId: string,
  mine: Provider[],
  { limit = 24, round = 0 }: { limit?: number; round?: number } = {},
): Promise<RecommendationRound> {
  const [favorites, saved, dismissed] = await Promise.all([
    db.favorite.findMany({ where: { userId, list: "loved" }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.favorite.findMany({ where: { userId }, select: { mediaType: true, tmdbId: true } }),
    db.dismissed.findMany({ where: { userId } }),
  ]);
  // Anything already on either list isn't suggested again.
  const skip = new Set([
    ...saved.map((f) => `${f.mediaType}:${f.tmdbId}`),
    ...dismissed.map((d) => `${d.mediaType}:${d.tmdbId}`),
  ]);

  if (favorites.length === 0) {
    const r = round % POPULAR_PAGES;
    return { titles: await popularFallback(mine, skip, limit, r), round: r, startedOver: round > 0 && r === 0 };
  }

  const lists = await mapLimit(favorites, 6, async (fav) => {
    try {
      return { fav, results: await getRecommendations(fav.mediaType as MediaType, fav.tmdbId) };
    } catch {
      return { fav, results: [] };
    }
  });

  const scored = new Map<string, { title: TitleSummary; score: number; because: string; best: number }>();
  for (const { fav, results } of lists) {
    results.forEach((title, rank) => {
      const key = `${title.mediaType}:${title.id}`;
      if (skip.has(key)) return;
      const points = 1 - rank / 25;
      const entry = scored.get(key);
      if (!entry) scored.set(key, { title, score: points, because: fav.title, best: points });
      else {
        entry.score += points;
        if (points > entry.best) Object.assign(entry, { because: fav.title, best: points });
      }
    });
  }

  const all = Array.from(scored.values()).sort((a, b) => b.score - a.score);
  const stretch = limit * 3; // about a third are usually on the household's services
  const r = round % Math.max(1, Math.ceil(all.length / stretch));
  const ranked = all.slice(r * stretch, (r + 1) * stretch);
  const services = await servicesForTitles(
    ranked.map((r) => r.title),
    mine,
  );
  const onMine = ranked
    .map((r) => ({ ...r.title, because: r.because, services: services.get(`${r.title.mediaType}:${r.title.id}`) ?? [] }))
    .filter((r) => r.services.length > 0);

  const startedOver = round > 0 && r === 0;
  if (onMine.length >= 6) return { titles: onMine.slice(0, limit), round: r, startedOver };
  const extra = await popularFallback(mine, new Set([...skip, ...onMine.map((t) => `${t.mediaType}:${t.id}`)]), limit, r % POPULAR_PAGES);
  return { titles: [...onMine, ...extra].slice(0, limit), round: r, startedOver };
}

async function popularFallback(mine: Provider[], skip: Set<string>, limit: number, round = 0): Promise<Recommendation[]> {
  if (mine.length === 0) return [];
  const ids = mine.map((p) => p.id);
  const [tv, movies] = await Promise.all([
    discover({ mediaType: "tv", providerIds: ids, sort: "top", page: round + 1 }),
    discover({ mediaType: "movie", providerIds: ids, sort: "top", page: round + 1 }),
  ]);
  const mixed = tv.results.flatMap((t, i) => [t, movies.results[i]]).filter(Boolean) as TitleSummary[];
  const picks = mixed.filter((t) => !skip.has(`${t.mediaType}:${t.id}`)).slice(0, limit);
  const services = await servicesForTitles(picks, mine);
  return picks.map((t) => ({ ...t, because: null, services: services.get(`${t.mediaType}:${t.id}`) ?? [] }));
}
