import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasTmdbKey } from "@/lib/tmdb";
import { TmdbProblem } from "@/components/Notice";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const me = await currentUser();
  const user = await db.user.findUnique({ where: { id: me.id }, select: { letterboxdUser: true, letterboxdSyncedAt: true } });
  if (!hasTmdbKey()) return <TmdbProblem />;
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold">Bring in what you already watch</h1>
      <p className="mt-1 text-paper-muted">
        Fill your lists in one go, so alerts and recommendations work from day one. Or{" "}
        <Link href="/welcome" className="text-marquee underline">
          pick from popular titles
        </Link>
        .
      </p>
      <ImportClient letterboxd={{ username: user?.letterboxdUser ?? null, syncedAt: user?.letterboxdSyncedAt?.toISOString() ?? null }} />
    </div>
  );
}
