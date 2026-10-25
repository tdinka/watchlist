import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  services: z.array(z.number().int().positive()).max(60).optional(),
});

export async function PATCH(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { name, services } = parsed.data;
  await db.household.update({
    where: { id: session.user.householdId },
    data: { ...(name ? { name } : {}), ...(services ? { services: Array.from(new Set(services)) } : {}) },
  });
  return NextResponse.json({ ok: true });
}
