import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { favoriteKeys } from "@/lib/favorites";
import { getHouseholdServices } from "@/lib/services";
import { discover, getGenres, hasTmdbKey, type MediaType } from "@/lib/tmdb";
import { TitleCard, TitleGrid } from "@/components/TitleCard";
import { NoServices, TmdbProblem } from "@/components/Notice";
import { ServiceLogo } from "@/components/ServiceLogos";

export const dynamic = "force-dynamic";

type Search = { service?: string; type?: string; genre?: string; sort?: string; page?: string };

const SORTS = [
  { value: "popular", label: "Popular" },
  { value: "newest", label: "Newest" },
  { value: "top", label: "Top rated" },
] as const;

export default async function BrowsePage({ searchParams }: { searchParams: Search }) {
  const user = await currentUser();
  const services = await getHouseholdServices(user.householdId);
  if (services.length === 0) return <NoServices />;
  if (!hasTmdbKey()) return <TmdbProblem />;

  const mediaType: MediaType = searchParams.type === "movie" ? "movie" : "tv";
  const serviceId = Number(searchParams.service) || null;
  const sort = SORTS.find((s) => s.value === searchParams.sort)?.value ?? "popular";
  const genreId = Number(searchParams.genre) || undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const selected = services.filter((s) => !serviceId || s.id === serviceId);

  const link = (change: Partial<Search>) => {
    const next = { ...searchParams, page: undefined, ...change };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString();
    return `/browse${qs ? `?${qs}` : ""}`;
  };

  let data;
  let genres: { id: number; name: string }[] = [];
  try {
    [data, genres] = await Promise.all([
      discover({ mediaType, providerIds: selected.map((s) => s.id), genreId, sort, page }),
      getGenres(mediaType),
    ]);
  } catch {
    return <TmdbProblem />;
  }
  const favKeys = await favoriteKeys(user.id);
  // Without per-title lookups we only know a title is on one of the chosen
  // services; when only one is chosen we can say which.
  const badge = selected.length === 1 ? selected : undefined;

  return (
    <div>
      <h1 className="text-3xl font-bold">Browse</h1>

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Link href={link({ service: undefined })} className={`chip ${!serviceId ? "chip-on" : ""}`}>
            All my services
          </Link>
          {services.map((s) => (
            <Link key={s.id} href={link({ service: String(s.id) })} className={`chip ${serviceId === s.id ? "chip-on" : ""}`}>
              <ServiceLogo provider={s} size={18} />
              {s.name}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["tv", "movie"] as const).map((t) => (
            <Link key={t} href={link({ type: t, genre: undefined })} className={`chip ${mediaType === t ? "chip-on" : ""}`}>
              {t === "tv" ? "Shows" : "Movies"}
            </Link>
          ))}
          <span className="mx-1 h-5 w-px bg-night-line" />
          {SORTS.map((s) => (
            <Link key={s.value} href={link({ sort: s.value })} className={`chip ${sort === s.value ? "chip-on" : ""}`}>
              {s.label}
            </Link>
          ))}
        </div>
        <div className="scroll-row !pb-1">
          <Link href={link({ genre: undefined })} className={`chip shrink-0 ${!genreId ? "chip-on" : ""}`}>
            All genres
          </Link>
          {genres.map((g) => (
            <Link key={g.id} href={link({ genre: String(g.id) })} className={`chip shrink-0 ${genreId === g.id ? "chip-on" : ""}`}>
              {g.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {data.results.length === 0 ? (
          <p className="text-paper-muted">Nothing matches those filters.</p>
        ) : (
          <TitleGrid>
            {data.results.map((t) => (
              <TitleCard key={`${t.mediaType}:${t.id}`} title={t} services={badge} favorite={favKeys.has(`${t.mediaType}:${t.id}`)} />
            ))}
          </TitleGrid>
        )}
      </div>

      <div className="mt-8 flex justify-center gap-3">
        {page > 1 && (
          <Link className="btn-quiet" href={link({ page: String(page - 1) })}>
            ← Previous
          </Link>
        )}
        {page < data.totalPages && (
          <Link className="btn-quiet" href={link({ page: String(page + 1) })}>
            More →
          </Link>
        )}
      </div>
    </div>
  );
}
