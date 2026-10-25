import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { favoriteKeys } from "@/lib/favorites";
import { recommendFor } from "@/lib/recommendations";
import { getHouseholdServices } from "@/lib/services";
import { hasTmdbKey } from "@/lib/tmdb";
import { TitleCard, TitleGrid } from "@/components/TitleCard";
import { NoServices, TmdbProblem } from "@/components/Notice";
import { ActionButton } from "@/components/ActionButton";

export const dynamic = "force-dynamic";

export default async function ForYouPage() {
  const user = await currentUser();
  const mine = await getHouseholdServices(user.householdId);
  if (mine.length === 0) return <NoServices />;
  if (!hasTmdbKey()) return <TmdbProblem />;

  let recs;
  try {
    recs = await recommendFor(user.id, mine);
  } catch {
    return <TmdbProblem />;
  }
  const [favKeys, favCount] = await Promise.all([favoriteKeys(user.id), db.favorite.count({ where: { userId: user.id } })]);

  return (
    <div>
      <h1 className="text-3xl font-bold">For you</h1>
      <p className="mt-1 max-w-2xl text-paper-muted">
        {favCount === 0
          ? "Highly rated on your services. Favorite a few things you love and these will get personal."
          : "Picked from what you've favorited, and all streaming on your services."}
      </p>
      <div className="mt-6">
        <TitleGrid>
          {recs.map((t) => (
            <TitleCard
              key={`${t.mediaType}:${t.id}`}
              title={t}
              services={t.services}
              favorite={favKeys.has(`${t.mediaType}:${t.id}`)}
              note={t.because ? `Because you liked ${t.because}` : null}
            >
              <ActionButton url="/api/dismiss" body={{ tmdbId: t.id, mediaType: t.mediaType }} className="mt-1 text-xs text-paper-faint hover:text-paper">
                Not for me
              </ActionButton>
            </TitleCard>
          ))}
        </TitleGrid>
      </div>
    </div>
  );
}
