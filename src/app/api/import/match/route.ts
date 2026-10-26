import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { favoriteKeys } from "@/lib/favorites";
import { matchTitles } from "@/lib/matching";

export const maxDuration = 120;

const schema = z.object({
  items: z
    .array(
      z.object({
        query: z.string().trim().min(1).max(200),
        kind: z.enum(["tv", "movie"]).optional(),
        count: z.number().int().min(0).optional(),
        lastWatched: z.string().max(10).nullable().optional(),
      }),
    )
    .min(1)
    .max(250),
});

// Finds the TMDB title for each name from a Netflix history file or a pasted list.
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const [results, favorites] = await Promise.all([matchTitles(parsed.data.items), favoriteKeys(session.user.id)]);
  return NextResponse.json({ results, favorites: Array.from(favorites) });
}
