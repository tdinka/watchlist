import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { favoriteKeys } from "@/lib/favorites";
import { getHouseholdServices, matchServices, servicesForTitles } from "@/lib/services";
import { hasTmdbKey, imageUrl, isMediaType, parseAvailability, summaries, tmdb, type Provider } from "@/lib/tmdb";
import { SaveButtons } from "@/components/SaveButtons";
import { ServiceLogo } from "@/components/ServiceLogos";
import { TitleCard, TitleRow } from "@/components/TitleCard";
import { TmdbProblem } from "@/components/Notice";

export const dynamic = "force-dynamic";

function formatDate(date: string | null | undefined) {
  if (!date) return null;
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function ProviderList({ label, providers, mine }: { label: string; providers: Provider[]; mine?: boolean }) {
  if (providers.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-paper-faint">{label}</h3>
      <div className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <span
            key={p.id}
            className={`inline-flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${mine ? "border-live/60 bg-live-soft" : "border-night-line"}`}
          >
            <ServiceLogo provider={p} size={22} />
            {p.name}
            {mine && <span className="text-live">✓</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function TitlePage({ params }: { params: { type: string; id: string } }) {
  const user = await currentUser();
  const id = Number(params.id);
  if (!isMediaType(params.type) || !id) notFound();
  const mediaType = params.type;
  if (!hasTmdbKey()) return <TmdbProblem />;

  let raw: any;
  try {
    raw = await tmdb(`/${mediaType}/${id}`, { append_to_response: "watch/providers,recommendations,credits", language: "en-US" }, { revalidate: 6 * 3600 });
  } catch (err) {
    if ((err as Error).message.includes("404")) notFound();
    return <TmdbProblem />;
  }

  const mine = await getHouseholdServices(user.householdId);
  const availability = parseAvailability(raw["watch/providers"]);
  const onMine = matchServices(availability.stream, mine);
  const otherStreams = availability.stream.filter((p) => matchServices([p], mine).length === 0);
  const rentOrBuy = [...availability.rent, ...availability.buy.filter((b) => !availability.rent.some((r) => r.id === b.id))];

  const title: string = mediaType === "movie" ? raw.title : raw.name;
  const date: string | undefined = mediaType === "movie" ? raw.release_date : raw.first_air_date;
  const favKeys = await favoriteKeys(user.id);
  const savedTo = favKeys.get(`${mediaType}:${id}`) ?? null;
  const isFavorite = savedTo !== null;

  const recs = summaries(raw.recommendations?.results, mediaType).slice(0, 18);
  const recServices = await servicesForTitles(recs, mine);
  const state = mediaType === "tv" && isFavorite ? await db.showState.findUnique({ where: { tmdbId: id } }) : null;

  const facts = [
    date?.slice(0, 4),
    mediaType === "tv" ? `${raw.number_of_seasons} season${raw.number_of_seasons === 1 ? "" : "s"}` : raw.runtime ? `${Math.floor(raw.runtime / 60)}h ${raw.runtime % 60}m` : null,
    (raw.genres ?? []).map((g: any) => g.name).slice(0, 3).join(", "),
    raw.vote_count > 20 ? `★ ${Math.round(raw.vote_average * 10) / 10}` : null,
    mediaType === "tv" ? raw.status : null,
  ].filter(Boolean);

  const backdrop = imageUrl(raw.backdrop_path, "w1280");
  const poster = imageUrl(raw.poster_path, "w342");
  const last = raw.last_episode_to_air;
  const next = raw.next_episode_to_air;
  const cast = (raw.credits?.cast ?? []).slice(0, 6).map((c: any) => c.name).join(", ");

  return (
    <div>
      {backdrop && (
        <div className="relative -mx-4 -mt-6 mb-[-6rem] h-64 overflow-hidden sm:-mx-6 sm:h-80">
          <img src={backdrop} alt="" className="h-full w-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-t from-night via-night/60 to-transparent" />
        </div>
      )}
      <div className="relative flex flex-col gap-6 sm:flex-row">
        {poster && <img src={poster} alt="" className="w-40 shrink-0 self-start rounded-xl shadow-2xl sm:w-52" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-paper-muted">{mediaType === "tv" ? "Series" : "Movie"}</p>
          <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-paper-muted">{facts.join(" · ")}</p>
          <div className="mt-4">
            <SaveButtons tmdbId={id} mediaType={mediaType} title={title} posterPath={raw.poster_path ?? null} initial={savedTo} />
          </div>
          {raw.overview && <p className="mt-5 max-w-2xl leading-relaxed">{raw.overview}</p>}
          {cast && <p className="mt-3 text-sm text-paper-muted">With {cast}</p>}

          <div className="card mt-6 space-y-4 p-4">
            {onMine.length > 0 ? (
              <ProviderList label="On your services" providers={onMine} mine />
            ) : (
              <p className="text-sm">
                <span className="font-semibold">Not on your services right now.</span>{" "}
                <span className="text-paper-muted">
                  {isFavorite ? "You'll hear when it arrives." : "Add it to Want to watch to hear when it arrives."}
                </span>
              </p>
            )}
            <ProviderList label="Also streaming on" providers={otherStreams} />
            <ProviderList label="Rent or buy" providers={rentOrBuy.slice(0, 8)} />
            {availability.link && (
              <a href={availability.link} target="_blank" rel="noreferrer" className="inline-block text-sm text-marquee underline">
                Open on a service →
              </a>
            )}
          </div>

          {mediaType === "tv" && (last || next) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {last && (
                <div className="card p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-paper-faint">Latest episode</h3>
                  <p className="mt-1 font-medium">
                    S{last.season_number} E{last.episode_number} · {last.name}
                  </p>
                  <p className="text-sm text-paper-muted">{formatDate(last.air_date)}</p>
                </div>
              )}
              {next ? (
                <div className="card border-flare/50 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-flare">Next episode</h3>
                  <p className="mt-1 font-medium">
                    S{next.season_number} E{next.episode_number}
                    {next.name && !/^Episode \d+$/.test(next.name) ? ` · ${next.name}` : ""}
                  </p>
                  <p className="text-sm text-paper-muted">{formatDate(next.air_date) ?? "Date not announced"}</p>
                </div>
              ) : (
                raw.status === "Returning Series" && (
                  <div className="card p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-paper-faint">Next episode</h3>
                    <p className="mt-1 text-sm text-paper-muted">
                      Coming back, date not announced.{isFavorite ? " You'll get an alert." : ""}
                    </p>
                  </div>
                )
              )}
            </div>
          )}
          {state && <p className="mt-2 text-xs text-paper-faint">Last checked for new episodes {state.checkedAt.toLocaleDateString("en-US")}.</p>}
        </div>
      </div>

      {recs.length > 0 && (
        <TitleRow heading="More like this">
          {recs.map((t) => (
            <TitleCard
              key={`${t.mediaType}:${t.id}`}
              title={t}
              compact
              saved={favKeys.get(`${t.mediaType}:${t.id}`) ?? null}
              services={recServices.get(`${t.mediaType}:${t.id}`)}
            />
          ))}
        </TitleRow>
      )}
    </div>
  );
}
