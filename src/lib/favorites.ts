import { db } from "@/lib/db";

// Keys like "tv:1399" for everything this person has favorited.
export async function favoriteKeys(userId: string): Promise<Set<string>> {
  const favs = await db.favorite.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true } });
  return new Set(favs.map((f) => `${f.mediaType}:${f.tmdbId}`));
}
