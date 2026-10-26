import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveToList } from "@/lib/favorites";

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
  // Saves it to `list`, or moves it there from the other list.
  await saveToList(session.user, { tmdbId, mediaType, title, posterPath: posterPath ?? null }, list);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL(req.url);
  const tmdbId = Number(url.searchParams.get("id"));
  const mediaType = url.searchParams.get("type");
  if (!tmdbId || (mediaType !== "tv" && mediaType !== "movie")) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  await db.favorite.deleteMany({ where: { userId: session.user.id, tmdbId, mediaType } });
  return NextResponse.json({ ok: true });
}
