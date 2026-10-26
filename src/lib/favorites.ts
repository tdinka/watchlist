import { db } from "@/lib/db";
import { recordShowState } from "@/lib/alerts";
import { getHouseholdServices, matchServices } from "@/lib/services";
import { getAvailability, mapLimit, type MediaType } from "@/lib/tmdb";

export type FavoriteInput = { tmdbId: number; mediaType: MediaType; title: string; posterPath: string | null };

// Keys like "tv:1399" for everything this person has favorited.
export async function favoriteKeys(userId: string): Promise<Set<string>> {
  const favs = await db.favorite.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true } });
  return new Set(favs.map((f) => `${f.mediaType}:${f.tmdbId}`));
}

// Adds favorites (skipping ones already there) and returns how many were new.
// For each one it notes which of the household's services it's on now, and
// for shows the latest episode, so the daily check only alerts about what
// comes out from now on.
export async function addFavorites(user: { id: string; householdId: string }, items: FavoriteInput[]) {
  const existing = await favoriteKeys(user.id);
  const seen = new Set<string>();
  const fresh = items.filter((i) => {
    const key = `${i.mediaType}:${i.tmdbId}`;
    if (existing.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (fresh.length === 0) return 0;

  const mine = await getHouseholdServices(user.householdId);
  const rows = await mapLimit(fresh, 6, async (item) => {
    let availableOn: string | null = null;
    try {
      availableOn = matchServices((await getAvailability(item.mediaType, item.tmdbId)).stream, mine)
        .map((p) => p.name)
        .join(", ");
    } catch {}
    return { userId: user.id, ...item, availableOn };
  });
  const { count } = await db.favorite.createMany({ data: rows, skipDuplicates: true });

  const showIds = fresh.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId);
  const known = new Set(
    (await db.showState.findMany({ where: { tmdbId: { in: showIds } }, select: { tmdbId: true } })).map((s) => s.tmdbId),
  );
  await mapLimit(
    showIds.filter((id) => !known.has(id)),
    4,
    (id) => recordShowState(id).catch(() => {}),
  );
  return count;
}
