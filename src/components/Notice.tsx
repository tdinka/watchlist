import Link from "next/link";
import { hasTmdbKey } from "@/lib/tmdb";

export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card my-6 p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-1 text-sm text-paper-muted">{children}</div>
    </div>
  );
}

// Shown in place of a page's content when TMDB isn't set up or can't be reached.
export function TmdbProblem() {
  return hasTmdbKey() ? (
    <Notice title="Couldn't reach TMDB">TMDB, where all the title information comes from, didn&apos;t answer. Try again in a minute.</Notice>
  ) : (
    <Notice title="Almost ready">
      The app needs a TMDB key before it can show any titles. Add <code>TMDB_API_KEY</code> to the <code>.env</code> file (see
      the README), then restart the app.
    </Notice>
  );
}

export function NoServices() {
  return (
    <Notice title="Pick your services">
      Tell the app which streaming services your household has in{" "}
      <Link href="/settings" className="text-marquee underline">
        Settings
      </Link>
      .
    </Notice>
  );
}
