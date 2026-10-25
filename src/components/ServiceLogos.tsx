import { imageUrl, type Provider } from "@/lib/tmdb";

export function ServiceLogo({ provider, size = 20 }: { provider: Provider; size?: number }) {
  const logo = imageUrl(provider.logoPath, "w92");
  return logo ? (
    <img src={logo} alt={provider.name} title={provider.name} width={size} height={size} className="rounded" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded bg-night-raised px-1.5 py-0.5 text-[10px] text-paper-muted">{provider.name}</span>
  );
}

// Small logos meaning "streaming on your service"; green ring marks them as yours.
export function ServiceLogos({ services, className = "" }: { services: Provider[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {services.map((p) => (
        <span key={p.id} className="rounded ring-1 ring-live/70">
          <ServiceLogo provider={p} />
        </span>
      ))}
    </div>
  );
}
