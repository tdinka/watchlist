import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

// Marks all of this person's alerts as read.
export async function POST() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await db.alert.updateMany({ where: { userId: session.user.id, readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
}
