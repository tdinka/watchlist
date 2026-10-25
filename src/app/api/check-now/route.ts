import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { runChecks } from "@/lib/alerts";

export const maxDuration = 120;

// The "Check now" button in Settings: the daily check, for this household only.
export async function POST() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(await runChecks({ householdId: session.user.householdId }));
}
