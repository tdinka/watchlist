import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ emailAlerts: z.boolean() });

export async function PATCH(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await db.user.update({ where: { id: session.user.id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}
