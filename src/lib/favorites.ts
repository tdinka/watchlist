import { db } from "@/lib/db";
import { recordShowState } from "@/lib/alerts";
import { getHouseholdServices, matchServices } from "@/lib/services";
import { getAvailability, mapLimit, type MediaType } from "@/lib/tmdb";

// "loved" = watched and liked (drives recommendations); "want" = want to
// watch; "watched" = seen it (kept out of recommendations, no alerts). Loved
// and Want are independent; marking something Watched takes it off Want.
export type ListName = "loved" | "want" | "watched";
export type Saved = { want: boolean; loved: boolean; watched: boolean };

export const LIST_NAMES: ListName[] = ["want", "loved", "watched"];
// The lists the daily check sends alerts for.
export const ALERT_LISTS: ListName[] = ["want", "loved"];

export function isListName(value: unknown): value is ListName {
  return value === "loved" || value === "want" || value === "watched";
}

export type FavoriteInput = { tmdbId: number; mediaType: MediaType; title: string; posterPath: string | null };

// Which lists each saved title is on, keyed like "tv:1399".
export async function favoriteKeys(userId: string): Promise<Map<string, Saved>> {
  const favs = await db.favorite.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true, list: true } });
  const out = new Map<string, Saved>();
  for (const f of favs) {
    const key = `${f.mediaType}:${f.tmdbId}`;
    const saved = out.get(key) ?? { want: false, loved: false, watched: false };
    if (isListName(f.list)) saved[f.list] = true;
    out.set(key, saved);
  }
  return out;
}

// Adds titles to one list (skipping ones already on that list) and returns
// how many were new. For Loved and Want it notes which of the household's
// services each is on now, and for shows the latest episode, so the daily
// check only alerts about what comes out from now on. Adding to Watched
// takes the titles off Want to watch.
export async function addFavorites(user: { id: string; householdId: string }, items: FavoriteInput[], list: ListName = "loved") {
  const existing = await favoriteKeys(user.id);
  const seen = new Set<string>();
  const fresh = items.filter((i) => {
    const key = `${i.mediaType}:${i.tmdbId}`;
    if (existing.get(key)?.[list] || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (list === "watched" && items.length) {
    await db.favorite.deleteMany({
      where: { userId: user.id, list: "want", OR: items.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })) },
    });
  }
  if (fresh.length === 0) return 0;
  if (list === "watched") {
    const { count } = await db.favorite.createMany({ data: fresh.map((i) => ({ userId: user.id, ...i, list })), skipDuplicates: true });
    return count;
  }

  const mine = await getHouseholdServices(user.householdId);
  const rows = await mapLimit(fresh, 6, async (item) => {
    let availableOn: string | null = null;
    try {
      availableOn = matchServices((await getAvailability(item.mediaType, item.tmdbId)).stream, mine)
        .map((p) => p.name)
        .join(", ");
    } catch {}
    return { userId: user.id, ...item, list, availableOn };
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
