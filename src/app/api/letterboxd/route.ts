import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchFeed, isLetterboxdUsername, syncLetterboxd } from "@/lib/letterboxd";

export const maxDuration = 60;

// Connect a Letterboxd username (and bring in its recent films now), or
// sync again with {username} unchanged.
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?letterboxd\.com\//, "").replace(/\/.*$/, "");
  if (!isLetterboxdUsername(username)) return NextResponse.json({ error: "That doesn't look like a Letterboxd username." }, { status: 400 });

  const current = await db.user.findUnique({ where: { id: session.user.id } });
  if (!current) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const changed = current.letterboxdUser?.toLowerCase() !== username.toLowerCase();
  try {
    if (changed) await fetchFeed(username); // checks the account exists before saving it
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  const user = changed
    ? await db.user.update({ where: { id: current.id }, data: { letterboxdUser: username, letterboxdSyncedAt: null } })
    : current;
  try {
    const added = await syncLetterboxd(user);
    return NextResponse.json({ username, added });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function DELETE() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await db.user.update({ where: { id: session.user.id }, data: { letterboxdUser: null, letterboxdSyncedAt: null } });
  return NextResponse.json({ ok: true });
}
