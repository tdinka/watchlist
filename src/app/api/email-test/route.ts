import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailConfigured, emailLayout, sendEmail } from "@/lib/email";

export async function POST() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!emailConfigured()) return NextResponse.json({ error: "Email isn't set up yet." }, { status: 400 });
  const user = await db.user.findUniqueOrThrow({ where: { id: session.user.id } });
  try {
    await sendEmail(
      user.email,
      "Watchlist test email",
      emailLayout("It works!", "<p>This is how you'll hear about new seasons, new episodes and arrivals on your services.</p>"),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
