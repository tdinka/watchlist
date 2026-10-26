import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getTrailer, isMediaType } from "@/lib/tmdb";

// The trailer for one title, looked up when someone presses play on a card.
export async function GET(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const type = params.get("type");
  const id = Number(params.get("id"));
  if (!isMediaType(type) || !Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    return NextResponse.json({ trailer: await getTrailer(type, id) });
  } catch {
    return NextResponse.json({ error: "Couldn't reach TMDB" }, { status: 502 });
  }
}
