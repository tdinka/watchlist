import { currentUser } from "@/lib/auth";
import { favoriteKeys } from "@/lib/favorites";
import { getHouseholdServices } from "@/lib/services";
import { discover, hasTmdbKey, type TitleSummary } from "@/lib/tmdb";
import { NoServices, TmdbProblem } from "@/components/Notice";
import { PickGrid } from "./PickGrid";

export const dynamic = "force-dynamic";

// A mix of what's popular now and long-time favorites, so there's something
// for most tastes. No duplicates; things already favorited are left out.
async function pickable(providerIds: number[], skip: Set<string>) {
  const [popTv, topTv, popMovies, topMovies] = await Promise.all([
    discover({ mediaType: "tv", providerIds }),
    discover({ mediaType: "tv", providerIds, sort: "top" }),
    discover({ mediaType: "movie", providerIds }),
    discover({ mediaType: "movie", providerIds, sort: "top" }),
  ]);
  const pick = (lists: TitleSummary[][]) => {
    const seen = new Set<string>();
    const out: TitleSummary[] = [];
    for (let i = 0; i < 20; i++) {
      for (const list of lists) {
        const t = list[i];
        const key = t && `${t.mediaType}:${t.id}`;
        if (t && t.posterPath && !seen.has(key) && !skip.has(key)) seen.add(key), out.push(t);
      }
    }
    return out.slice(0, 30);
  };
  return { tv: pick([popTv.results, topTv.results]), movies: pick([popMovies.results, topMovies.results]) };
}

export default async function WelcomePage() {
  const user = await currentUser();
  const services = await getHouseholdServices(user.householdId);
  if (services.length === 0) return <NoServices />;
  if (!hasTmdbKey()) return <TmdbProblem />;

  let titles;
  try {
    titles = await pickable(
      services.map((s) => s.id),
      await favoriteKeys(user.id),
    );
  } catch {
    return <TmdbProblem />;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold">What do you love?</h1>
      <p className="mt-1 max-w-2xl text-paper-muted">
        Tap a few shows and movies you&apos;ve enjoyed. They become your favorites, so recommendations fit your taste and you hear
        about new seasons.
      </p>
      <PickGrid tv={titles.tv} movies={titles.movies} />
    </div>
  );
}
