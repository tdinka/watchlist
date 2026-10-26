import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { favoriteKeys } from "@/lib/favorites";
import { matchTitles, type MatchQuery } from "@/lib/matching";

export const maxDuration = 120;

const MAX_ITEMS = 250;

// Each entry is checked on its own, so one odd line in a viewing-history file
// (a blank name, a very long title, an unreadable date) is skipped instead of
// failing the whole import.
const itemSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.slice(0, 200)),
  kind: z.enum(["tv", "movie"]).optional().catch(undefined),
  count: z.number().int().min(0).optional().catch(undefined),
  lastWatched: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .catch(null),
});

// Finds the TMDB title for each name from a Netflix history file or a pasted list.
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.items)) return NextResponse.json({ error: "Nothing to look up." }, { status: 400 });

  const items: MatchQuery[] = [];
  const problems: string[] = [];
  for (const raw of (body.items as unknown[]).slice(0, MAX_ITEMS)) {
    const parsed = itemSchema.safeParse(raw);
    if (parsed.success) items.push(parsed.data);
    else problems.push(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  if (problems.length) console.warn(`Import: skipped ${problems.length} entr${problems.length === 1 ? "y" : "ies"}:`, problems.slice(0, 5));
  if (items.length === 0) return NextResponse.json({ error: "None of those could be read." }, { status: 400 });

  const [results, favorites] = await Promise.all([matchTitles(items), favoriteKeys(session.user.id)]);
  return NextResponse.json({ results, favorites: Array.from(favorites.keys()), skipped: problems.length });
}
