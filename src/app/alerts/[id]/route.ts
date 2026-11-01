import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

// Opening an alert marks it seen and goes to the title.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  const alert = await db.alert.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!alert) return NextResponse.redirect(new URL("/alerts", req.url));
  if (!alert.readAt) await db.alert.update({ where: { id: alert.id }, data: { readAt: new Date() } });
  return NextResponse.redirect(new URL(`/title/${alert.mediaType}/${alert.tmdbId}`, req.url));
}
