import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordShowState } from "@/lib/alerts";
import { getHouseholdServices, matchServices } from "@/lib/services";
import { getAvailability } from "@/lib/tmdb";

const schema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(["tv", "movie"]),
  title: z.string().min(1).max(300),
  posterPath: z.string().max(200).nullable().optional(),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { tmdbId, mediaType, title, posterPath } = parsed.data;

  // Note where it's streaming now, so the daily check can say when it arrives
  // on one of your services.
  let availableOn: string | null = null;
  try {
    const mine = await getHouseholdServices(session.user.householdId);
    availableOn = matchServices((await getAvailability(mediaType, tmdbId)).stream, mine)
      .map((p) => p.name)
      .join(", ");
  } catch {}

  await db.favorite.upsert({
    where: { userId_mediaType_tmdbId: { userId: session.user.id, mediaType, tmdbId } },
    create: { userId: session.user.id, tmdbId, mediaType, title, posterPath: posterPath ?? null, availableOn },
    update: {},
  });

  // Remember the latest episode, so only episodes after today count as new.
  if (mediaType === "tv" && !(await db.showState.findUnique({ where: { tmdbId } }))) {
    await recordShowState(tmdbId).catch(() => {});
  }
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
