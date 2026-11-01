import Link from "next/link";
import type { Alert } from "@prisma/client";
import { imageUrl } from "@/lib/tmdb";

// Alerts as a list. Tapping one marks it seen, then opens the title.
export function AlertList({ alerts }: { alerts: Alert[] }) {
  return (
    <ul className="card divide-y divide-night-line">
      {alerts.map((a) => (
        <li key={a.id}>
          <Link href={`/alerts/${a.id}`} prefetch={false} className="flex items-center gap-3 p-3 hover:bg-night-raised">
            {a.posterPath ? (
              <img src={imageUrl(a.posterPath, "w92")!} alt="" className="h-14 w-10 rounded object-cover" />
            ) : (
              <div className="h-14 w-10 rounded bg-night-raised" />
            )}
            <div className="min-w-0 flex-1">
              <p className={a.readAt ? "text-paper-muted" : "font-medium"}>{a.message}</p>
              <p className="text-xs text-paper-faint">{a.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
            </div>
            {!a.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-flare" aria-label="new" />}
          </Link>
        </li>
      ))}
    </ul>
  );
}
