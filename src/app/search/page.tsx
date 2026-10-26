import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { favoriteKeys } from "@/lib/favorites";
import { getHouseholdServices, servicesForTitles } from "@/lib/services";
import { hasTmdbKey, searchTitles } from "@/lib/tmdb";
import { TitleCard, TitleGrid } from "@/components/TitleCard";
import { TmdbProblem } from "@/components/Notice";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string; all?: string } }) {
  const user = await currentUser();
  const query = (searchParams.q ?? "").trim();
  const showAll = searchParams.all === "1";

  const form = (
    <form action="/search" className="mt-4 flex gap-2">
      <input name="q" defaultValue={query} placeholder="A show, a movie…" className="input" autoFocus={!query} aria-label="Search" />
      {showAll && <input type="hidden" name="all" value="1" />}
      <button className="btn-primary">Search</button>
    </form>
  );

  if (!query) {
    return (
      <div>
        <h1 className="text-3xl font-bold">Search</h1>
        <p className="mt-1 text-paper-muted">Search across all your services at once.</p>
        {form}
      </div>
    );
  }
  if (!hasTmdbKey()) return <TmdbProblem />;

  let results;
  try {
    results = (await searchTitles(query)).results;
  } catch {
    return <TmdbProblem />;
  }
  const mine = await getHouseholdServices(user.householdId);
  const [onMine, favKeys] = await Promise.all([servicesForTitles(results, mine), favoriteKeys(user.id)]);
  const withServices = results.map((t) => ({ title: t, services: onMine.get(`${t.mediaType}:${t.id}`) ?? [] }));
  const available = withServices.filter((r) => r.services.length > 0);
  const elsewhere = withServices.filter((r) => r.services.length === 0);
  const qs = (all: boolean) => `/search?q=${encodeURIComponent(query)}${all ? "&all=1" : ""}`;

  return (
    <div>
      <h1 className="text-3xl font-bold">Search</h1>
      {form}

      <div className="mt-4 flex gap-2">
        <Link href={qs(false)} className={`chip ${!showAll ? "chip-on" : ""}`}>
          On my services ({available.length})
        </Link>
        <Link href={qs(true)} className={`chip ${showAll ? "chip-on" : ""}`}>
          Everything ({results.length})
        </Link>
      </div>

      <div className="mt-6">
        {available.length > 0 ? (
          <TitleGrid>
            {available.map(({ title, services }) => (
              <TitleCard key={`${title.mediaType}:${title.id}`} title={title} services={services} saved={favKeys.get(`${title.mediaType}:${title.id}`) ?? null} />
            ))}
          </TitleGrid>
        ) : (
          <p className="text-paper-muted">Nothing called &ldquo;{query}&rdquo; is streaming on your services right now.</p>
        )}
      </div>

      {showAll && elsewhere.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 text-xl font-bold">Not on your services</h2>
          <p className="mb-4 text-sm text-paper-muted">Add one to Want to watch and you&apos;ll hear when it arrives on a service you have.</p>
          <TitleGrid>
            {elsewhere.map(({ title }) => (
              <TitleCard key={`${title.mediaType}:${title.id}`} title={title} saved={favKeys.get(`${title.mediaType}:${title.id}`) ?? null} />
            ))}
          </TitleGrid>
        </section>
      )}
      {!showAll && elsewhere.length > 0 && (
        <p className="mt-8 text-sm text-paper-muted">
          {elsewhere.length} more result{elsewhere.length === 1 ? " isn't" : "s aren't"} on your services.{" "}
          <Link href={qs(true)} className="text-marquee underline">
            Show {elsewhere.length === 1 ? "it" : "them"}
          </Link>
        </p>
      )}
    </div>
  );
}
