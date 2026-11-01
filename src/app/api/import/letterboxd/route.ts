import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyFilmLog, matchFilms } from "@/lib/letterboxd";

export const maxDuration = 120;

const schema = z.object({
  films: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(300),
        year: z.number().int().min(1870).max(2100).nullable(),
        watched: z.boolean(),
        loved: z.boolean(),
        want: z.boolean(),
      }),
    )
    .min(1)
    .max(100),
});

// One batch of films from a Letterboxd export: find each on TMDB and add it
// to Watched / Loved / Want to watch.
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, householdId: true } });
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { matched, unmatched } = await matchFilms(parsed.data.films);
  const added = await applyFilmLog(user, matched);
  return NextResponse.json({ added, unmatched });
}
