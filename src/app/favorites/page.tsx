import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getHouseholdServices } from "@/lib/services";
import { TitleCard, TitleGrid } from "@/components/TitleCard";

export const dynamic = "force-dynamic";

function shortDate(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function FavoritesPage({ searchParams }: { searchParams: { type?: string } }) {
  const user = await currentUser();
  const type = searchParams.type === "movie" ? "movie" : searchParams.type === "tv" ? "tv" : null;
  const [favorites, mine] = await Promise.all([
    db.favorite.findMany({ where: { userId: user.id, ...(type ? { mediaType: type } : {}) }, orderBy: { createdAt: "desc" } }),
    getHouseholdServices(user.householdId),
  ]);
  const states = new Map(
    (await db.showState.findMany({ where: { tmdbId: { in: favorites.filter((f) => f.mediaType === "tv").map((f) => f.tmdbId) } } })).map((s) => [
      s.tmdbId,
      s,
    ]),
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-bold">Favorites</h1>
        <Link href="/import" className="text-sm text-marquee underline">
          Import more
        </Link>
      </div>
      <div className="mt-4 flex gap-2">
        {[
          { value: null, label: "All" },
          { value: "tv", label: "Shows" },
          { value: "movie", label: "Movies" },
        ].map((t) => (
          <Link key={t.label} href={t.value ? `/favorites?type=${t.value}` : "/favorites"} className={`chip ${type === t.value ? "chip-on" : ""}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {favorites.length === 0 ? (
        <p className="mt-6 max-w-xl text-paper-muted">
          Nothing here yet.{" "}
          <Link href="/import" className="text-marquee underline">
            Import your Netflix history or a list
          </Link>
          ,{" "}
          <Link href="/welcome" className="text-marquee underline">
            pick from popular titles
          </Link>
          , or tap the heart on any show or movie in{" "}
          <Link href="/browse" className="text-marquee underline">
            Browse
          </Link>{" "}
          or{" "}
          <Link href="/search" className="text-marquee underline">
            Search
          </Link>
          .
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
                  favorite
                  services={services}
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
