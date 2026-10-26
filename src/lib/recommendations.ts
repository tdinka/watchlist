import { db } from "@/lib/db";
import { servicesForTitles } from "@/lib/services";
import { discover, getRecommendations, mapLimit, type MediaType, type Provider, type TitleSummary } from "@/lib/tmdb";

export type Recommendation = TitleSummary & { because: string | null; services: Provider[] };

// Suggestions built from TMDB's "people who liked this also liked" lists for
// each title on the Loved list (not Want to watch: those aren't known likes).
// A title suggested by several loved titles ranks higher. Only titles
// streaming on the household's services are kept.
export async function recommendFor(userId: string, mine: Provider[], limit = 24): Promise<Recommendation[]> {
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

  if (favorites.length === 0) return popularFallback(mine, skip, limit);

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

  const ranked = Array.from(scored.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 3);
  const services = await servicesForTitles(
    ranked.map((r) => r.title),
    mine,
  );
  const onMine = ranked
    .map((r) => ({ ...r.title, because: r.because, services: services.get(`${r.title.mediaType}:${r.title.id}`) ?? [] }))
    .filter((r) => r.services.length > 0);

  if (onMine.length >= 6) return onMine.slice(0, limit);
  const extra = await popularFallback(mine, new Set([...skip, ...onMine.map((r) => `${r.mediaType}:${r.id}`)]), limit);
  return [...onMine, ...extra].slice(0, limit);
}

async function popularFallback(mine: Provider[], skip: Set<string>, limit: number): Promise<Recommendation[]> {
  if (mine.length === 0) return [];
  const ids = mine.map((p) => p.id);
  const [tv, movies] = await Promise.all([
    discover({ mediaType: "tv", providerIds: ids, sort: "top" }),
    discover({ mediaType: "movie", providerIds: ids, sort: "top" }),
  ]);
  const mixed = tv.results.flatMap((t, i) => [t, movies.results[i]]).filter(Boolean) as TitleSummary[];
  const picks = mixed.filter((t) => !skip.has(`${t.mediaType}:${t.id}`)).slice(0, limit);
  const services = await servicesForTitles(picks, mine);
  return picks.map((t) => ({ ...t, because: null, services: services.get(`${t.mediaType}:${t.id}`) ?? [] }));
}
