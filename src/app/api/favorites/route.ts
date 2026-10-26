import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addFavorites, isListName } from "@/lib/favorites";

const schema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(["tv", "movie"]),
  title: z.string().min(1).max(300),
  posterPath: z.string().max(200).nullable().optional(),
  list: z.enum(["loved", "want"]).default("loved"),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { tmdbId, mediaType, title, posterPath, list } = parsed.data;
  await addFavorites(session.user, [{ tmdbId, mediaType, title, posterPath: posterPath ?? null }], list);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL(req.url);
  const tmdbId = Number(url.searchParams.get("id"));
  const mediaType = url.searchParams.get("type");
  const list = url.searchParams.get("list");
  if (!tmdbId || (mediaType !== "tv" && mediaType !== "movie") || (list !== null && !isListName(list))) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  // Takes it off one list, or off both when no list is given.
  await db.favorite.deleteMany({ where: { userId: session.user.id, tmdbId, mediaType, ...(list ? { list } : {}) } });
  return NextResponse.json({ ok: true });
}
