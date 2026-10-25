import { NextResponse } from "next/server";
import { runChecks } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Called once a day by the Railway cron service, with CRON_SECRET.
async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runChecks());
}

export const GET = run;
export const POST = run;
