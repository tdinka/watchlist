import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { favoriteKeys, isListName, type ListName } from "@/lib/favorites";
import { daysLeft, formatLeavesOn, leavingFor } from "@/lib/leaving";
import { getHouseholdServices } from "@/lib/services";
import { imageUrl } from "@/lib/tmdb";
import { TitleCard, TitleGrid } from "@/components/TitleCard";

export const dynamic = "force-dynamic";

function shortDate(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TABS: { value: ListName; label: string; hint: string }[] = [
  {
    value: "want",
    label: "Want to watch",
    hint: "Titles you mean to watch. You'll hear when one arrives on your services or gets a new season. Watched it? Tap the heart to add it to Loved, and the bookmark to take it off this list.",
  },
  {
    value: "loved",
    label: "Loved",
    hint: "Titles you've watched and liked. Recommendations are based on these, and you'll hear about new seasons.",
  },
];

export default async function MyListsPage({ searchParams }: { searchParams: { list?: string; type?: string } }) {
  const user = await currentUser();
  const list: ListName = isListName(searchParams.list) ? searchParams.list : "want";
  const type = searchParams.type === "movie" ? "movie" : searchParams.type === "tv" ? "tv" : null;
  const [favorites, counts, mine, favKeys] = await Promise.all([
    db.favorite.findMany({ where: { userId: user.id, list, ...(type ? { mediaType: type } : {}) }, orderBy: { createdAt: "desc" } }),
    db.favorite.groupBy({ by: ["list"], where: { userId: user.id }, _count: true }),
    getHouseholdServices(user.householdId),
    favoriteKeys(user.id),
  ]);
  const leaving = await leavingFor(favorites, mine);
  const leavingSoon = favorites
    .filter((f) => leaving.has(`${f.mediaType}:${f.tmdbId}`))
    .sort((a, b) => leaving.get(`${a.mediaType}:${a.tmdbId}`)!.leavesOn.localeCompare(leaving.get(`${b.mediaType}:${b.tmdbId}`)!.leavesOn));
  const countFor = (l: ListName) => counts.find((c) => c.list === l)?._count ?? 0;
  const states = new Map(
    (await db.showState.findMany({ where: { tmdbId: { in: favorites.filter((f) => f.mediaType === "tv").map((f) => f.tmdbId) } } })).map((s) => [
      s.tmdbId,
      s,
    ]),
  );
  const today = new Date().toISOString().slice(0, 10);
  const href = (l: ListName, t: string | null) => `/favorites?list=${l}${t ? `&type=${t}` : ""}`;
  const tab = TABS.find((t) => t.value === list)!;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-bold">My lists</h1>
        <Link href="/import" className="text-sm text-marquee underline">
          Import more
        </Link>
      </div>

      <div className="mt-4 grid max-w-md grid-cols-2 gap-1 rounded-full border border-night-line p-1">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={href(t.value, type)}
            className={`rounded-full py-1.5 text-center text-sm ${list === t.value ? "bg-night-raised text-paper" : "text-paper-muted hover:text-paper"}`}
          >
            {t.label} <span className="text-paper-faint">{countFor(t.value)}</span>
          </Link>
        ))}
      </div>
      <p className="mt-3 max-w-2xl text-sm text-paper-muted">{tab.hint}</p>

      <div className="mt-4 flex gap-2">
        {[
          { value: null, label: "All" },
          { value: "tv", label: "Shows" },
          { value: "movie", label: "Movies" },
        ].map((t) => (
          <Link key={t.label} href={href(list, t.value)} className={`chip ${type === t.value ? "chip-on" : ""}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {list === "want" && leavingSoon.length > 0 && (
        <section className="card mt-6 border-ebb/40 p-4">
          <h2 className="text-lg font-bold">Leaving soon</h2>
          <p className="mt-0.5 text-sm text-paper-muted">Watch these first: they&apos;re about to leave your services.</p>
          <ul className="mt-3 divide-y divide-night-line">
            {leavingSoon.map((f) => {
              const l = leaving.get(`${f.mediaType}:${f.tmdbId}`)!;
              return (
                <li key={f.id}>
                  <Link href={`/title/${f.mediaType}/${f.tmdbId}`} className="flex items-center gap-3 py-2 hover:underline">
                    {f.posterPath ? (
                      <img src={imageUrl(f.posterPath, "w92")!} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-12 w-8 shrink-0 rounded bg-night-raised" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">{f.title}</span>
                    <span className="shrink-0 text-right text-sm text-ebb">
                      Leaves {l.service} {daysLeft(l.leavesOn)}
                      <span className="block text-xs text-paper-faint">last day {formatLeavesOn(l.leavesOn, { weekday: "short", month: "short", day: "numeric" })}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {favorites.length === 0 ? (
        <p className="mt-6 max-w-xl text-paper-muted">
          {list === "want" ? (
            <>
              Nothing here yet. Tap the bookmark on any show or movie in{" "}
              <Link href="/browse" className="text-marquee underline">
                Browse
              </Link>{" "}
              or{" "}
              <Link href="/search" className="text-marquee underline">
                Search
              </Link>
              , or{" "}
              <Link href="/import" className="text-marquee underline">
                type a list
              </Link>
              .
            </>
          ) : (
            <>
              Nothing here yet.{" "}
              <Link href="/import" className="text-marquee underline">
                Import your Netflix history or a list
              </Link>
              ,{" "}
              <Link href="/welcome" className="text-marquee underline">
                pick from popular titles
              </Link>
              , or tap the heart on anything you&apos;ve enjoyed.
            </>
          )}
        </p>
      ) : (
        <div className="mt-6">
          <TitleGrid>
            {favorites.map((f) => {
              const state = f.mediaType === "tv" ? states.get(f.tmdbId) : undefined;
              const names = f.availableOn ? f.availableOn.split(", ") : [];
              const services = mine.filter((p) => names.includes(p.name));
              let note: string | null = null;
              if (state?.nextAirDate && state.nextAirDate >= today) note = `Next: S${state.nextSeason} E${state.nextEpisode} on ${shortDate(state.nextAirDate)}`;
              else if (state?.status === "Ended" || state?.status === "Canceled") note = `Series ${state.status.toLowerCase()}`;
              else if (state?.lastAirDate) note = `Latest: S${state.lastSeason} E${state.lastEpisode}, ${shortDate(state.lastAirDate)}`;
              if (f.availableOn === "") note = note ? `${note} · not on your services` : "Not on your services yet";
              return (
                <TitleCard
                  key={f.id}
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
                  saved={favKeys.get(`${f.mediaType}:${f.tmdbId}`) ?? null}
                  services={services}
                  leaving={leaving.get(`${f.mediaType}:${f.tmdbId}`)}
                  note={note}
                />
              );
            })}
          </TitleGrid>
        </div>
      )}
    </div>
  );
}
