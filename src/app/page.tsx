import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ALERT_LISTS, favoriteKeys } from "@/lib/favorites";
import { leavingFor } from "@/lib/leaving";
import { getHouseholdServices } from "@/lib/services";
import { discover, hasTmdbKey, type Provider, type TitleSummary } from "@/lib/tmdb";
import { TitleCard, TitleRow } from "@/components/TitleCard";
import { NoServices, TmdbProblem } from "@/components/Notice";
import { ActionButton } from "@/components/ActionButton";
import { AlertList } from "@/components/AlertList";

export const dynamic = "force-dynamic";

// Home shows only unseen alerts, and only this many; the rest are on /alerts.
const HOME_ALERTS = 3;

function interleave(a: TitleSummary[], b: TitleSummary[]) {
  return a.flatMap((t, i) => (b[i] ? [t, b[i]] : [t]));
}

async function popularOn(service: Provider) {
  const [tv, movies] = await Promise.all([
    discover({ mediaType: "tv", providerIds: [service.id] }),
    discover({ mediaType: "movie", providerIds: [service.id] }),
  ]);
  return interleave(tv.results, movies.results).slice(0, 20);
}

async function recentOnServices(services: Provider[]) {
  const since = new Date(Date.now() - 45 * 86400 * 1000).toISOString().slice(0, 10);
  const ids = services.map((s) => s.id);
  const [tv, movies] = await Promise.all([
    discover({ mediaType: "tv", providerIds: ids, releasedAfter: since }),
    discover({ mediaType: "movie", providerIds: ids, releasedAfter: since }),
  ]);
  return interleave(tv.results, movies.results).slice(0, 20);
}

export default async function HomePage() {
  const user = await currentUser();
  const [alerts, services, favKeys, shows, ready] = await Promise.all([
    db.alert.findMany({ where: { userId: user.id, readAt: null }, orderBy: { createdAt: "desc" } }),
    getHouseholdServices(user.householdId),
    favoriteKeys(user.id),
    db.favorite.findMany({ where: { userId: user.id, mediaType: "tv", list: { in: ALERT_LISTS } }, orderBy: { createdAt: "desc" } }),
    // Want-to-watch titles that are on one of the household's services now.
    db.favorite.findMany({
      where: { userId: user.id, list: "want", AND: [{ availableOn: { not: null } }, { availableOn: { not: "" } }] },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  // Titles about to leave go first.
  const readyLeaving = await leavingFor(ready, services);
  const leavesOn = (f: (typeof ready)[number]) => readyLeaving.get(`${f.mediaType}:${f.tmdbId}`)?.leavesOn ?? "9999";
  ready.sort((a, b) => leavesOn(a).localeCompare(leavesOn(b)));
  const states = await db.showState.findMany({ where: { tmdbId: { in: shows.map((s) => s.tmdbId) } } });
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = states
    .filter((s) => s.nextAirDate && s.nextAirDate >= today)
    .sort((a, b) => a.nextAirDate!.localeCompare(b.nextAirDate!))
    .slice(0, 6);
  const unread = alerts;

  let rows: { heading: string; href: string; titles: TitleSummary[]; service?: Provider }[] = [];
  let tmdbFailed = !hasTmdbKey();
  if (!tmdbFailed && services.length) {
    try {
      const [recent, ...perService] = await Promise.all([recentOnServices(services), ...services.map(popularOn)]);
      rows = [
        { heading: "Just released on your services", href: "/browse?sort=newest", titles: recent },
        ...services.map((s, i) => ({ heading: `Popular on ${s.name}`, href: `/browse?service=${s.id}`, titles: perService[i], service: s })),
      ];
    } catch {
      tmdbFailed = true;
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold">Hi {user.name}</h1>

      {unread.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">
              New for you <span className="ml-1 rounded-full bg-flare px-2 py-0.5 align-middle text-xs text-night">{unread.length}</span>
            </h2>
            <div className="flex items-center gap-4 text-sm">
              {unread.length > HOME_ALERTS && (
                <Link href="/alerts" className="text-paper-muted hover:text-paper">
                  See all {unread.length} →
                </Link>
              )}
              <ActionButton url="/api/alerts" className="text-paper-muted hover:text-paper">
                Mark all as seen
              </ActionButton>
            </div>
          </div>
          <AlertList alerts={unread.slice(0, HOME_ALERTS)} />
        </section>
      )}

      {ready.length > 0 && (
        <TitleRow heading="Ready to watch from your list" href="/favorites?list=want">
          {ready.map((f) => (
            <TitleCard
              key={f.id}
              compact
              saved={favKeys.get(`${f.mediaType}:${f.tmdbId}`) ?? null}
              services={services.filter((p) => f.availableOn!.split(", ").includes(p.name))}
              leaving={readyLeaving.get(`${f.mediaType}:${f.tmdbId}`)}
              title={{
                id: f.tmdbId,
                mediaType: f.mediaType as "tv" | "movie",
                title: f.title,
                posterPath: f.posterPath,
                backdropPath: null,
                year: null,
                overview: "",
                rating: null,
                genreIds: [],
                popularity: 0,
              }}
            />
          ))}
        </TitleRow>
      )}

      {upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-bold">Coming up on your shows</h2>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((s) => (
              <Link key={s.tmdbId} href={`/title/tv/${s.tmdbId}`} className="chip">
                <span className="text-paper">{s.name}</span>
                <span>
                  S{s.nextSeason} E{s.nextEpisode} ·{" "}
                  {new Date(s.nextAirDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {shows.length === 0 && alerts.length === 0 && (
        <p className="mt-4 max-w-xl text-paper-muted">
          Tap the bookmark on anything you want to watch and the heart on things you&apos;ve loved, or{" "}
          <Link href="/import" className="text-marquee underline">
            import what you already watch
          </Link>
          . You&apos;ll see new seasons and episodes here, and get an email when they come out.
        </p>
      )}

      {services.length === 0 ? (
        <NoServices />
      ) : tmdbFailed ? (
        <TmdbProblem />
      ) : (
        rows.map((row) => (
          <TitleRow key={row.heading} heading={row.heading} href={row.href}>
            {row.titles.map((t) => (
              <TitleCard
                key={`${t.mediaType}:${t.id}`}
                title={t}
                compact
                saved={favKeys.get(`${t.mediaType}:${t.id}`) ?? null}
                services={row.service ? [row.service] : undefined}
              />
            ))}
          </TitleRow>
        ))
      )}
    </div>
  );
}
