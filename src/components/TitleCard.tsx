import Link from "next/link";
import { imageUrl, type Provider, type TitleSummary } from "@/lib/tmdb";
import type { Saved } from "@/lib/favorites";
import { SaveButtons } from "@/components/SaveButtons";
import { ServiceLogos } from "@/components/ServiceLogos";
import { TrailerIcon } from "@/components/Trailer";

export function TitleCard({
  title,
  services,
  saved,
  note,
  children,
  compact,
}: {
  title: TitleSummary;
  services?: Provider[];
  saved?: Saved | null; // which lists it's on; leave out to hide the save buttons
  note?: string | null;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  const poster = imageUrl(title.posterPath, "w342");
  return (
    <div className={`group relative flex flex-col ${compact ? "w-32 shrink-0 sm:w-36" : ""}`}>
      <Link href={`/title/${title.mediaType}/${title.id}`} className="block overflow-hidden rounded-lg bg-night-raised">
        {poster ? (
          <img src={poster} alt="" loading="lazy" className="aspect-[2/3] w-full object-cover transition group-hover:scale-[1.03]" />
        ) : (
          <div className="grid aspect-[2/3] place-items-center p-3 text-center text-sm text-paper-muted">{title.title}</div>
        )}
      </Link>
      <div className="absolute left-1.5 top-1.5">
        <TrailerIcon title={title.title} mediaType={title.mediaType} tmdbId={title.id} />
      </div>
      {saved !== undefined && (
        <div className="absolute right-1.5 top-1.5">
          <SaveButtons
            tmdbId={title.id}
            mediaType={title.mediaType}
            title={title.title}
            posterPath={title.posterPath}
            initial={saved}
            variant="icons"
          />
        </div>
      )}
      <div className="mt-2 min-w-0">
        <Link href={`/title/${title.mediaType}/${title.id}`} className="line-clamp-2 text-sm font-medium leading-snug hover:underline">
          {title.title}
        </Link>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-paper-faint">
          <span>{title.mediaType === "tv" ? "Series" : "Movie"}</span>
          {title.year && <span>· {title.year}</span>}
          {title.rating && <span>· ★ {title.rating}</span>}
        </div>
        {services && services.length > 0 && <ServiceLogos services={services} className="mt-1.5" />}
        {note && <p className="mt-1 line-clamp-2 text-xs text-paper-muted">{note}</p>}
        {children}
      </div>
    </div>
  );
}

export function TitleGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">{children}</div>;
}

export function TitleRow({ heading, href, children }: { heading: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-bold">{heading}</h2>
        {href && (
          <Link href={href} className="text-sm text-paper-muted hover:text-paper">
            See all →
          </Link>
        )}
      </div>
      <div className="scroll-row">{children}</div>
    </section>
  );
}
