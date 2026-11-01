import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ tmdbId: z.number().int().positive(), level: z.enum(["episodes", "seasons", "off"]) });

// The Alerts setting on a show's page.
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { tmdbId, level } = parsed.data;
  const userId = session.user.id;
  await db.showAlertSetting.upsert({
    where: { userId_tmdbId: { userId, tmdbId } },
    create: { userId, tmdbId, level },
    update: { level },
  });
  // Turning a show down also clears its unseen episode news.
  if (level !== "episodes") {
    await db.alert.updateMany({
      where: { userId, mediaType: "tv", tmdbId, readAt: null, kind: level === "off" ? undefined : "new_episode" },
      data: { readAt: new Date() },
    });
  }
  return NextResponse.json({ ok: true });
}
