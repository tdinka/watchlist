import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ tmdbId: z.number().int().positive(), mediaType: z.enum(["tv", "movie"]) });

// "Not for me" on a recommendation.
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { tmdbId, mediaType } = parsed.data;
  await db.dismissed.upsert({
    where: { userId_mediaType_tmdbId: { userId: session.user.id, mediaType, tmdbId } },
    create: { userId: session.user.id, mediaType, tmdbId },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
