import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { addFavorites } from "@/lib/favorites";

export const maxDuration = 120;

const schema = z.object({
  items: z
    .array(
      z.object({
        tmdbId: z.number().int().positive(),
        mediaType: z.enum(["tv", "movie"]),
        title: z.string().min(1).max(300),
        posterPath: z.string().max(200).nullable(),
      }),
    )
    .min(1)
    .max(300),
  list: z.enum(["loved", "want", "watched"]).default("loved"),
});

// Adds many favorites at once (Import page and the pick-what-you-love screen).
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const added = await addFavorites(session.user, parsed.data.items, parsed.data.list);
  return NextResponse.json({ added });
}
