import { db } from "@/lib/db";
import { getCatalog, serviceKey } from "@/lib/services";
import { mapLimit, REGION, type MediaType, type Provider } from "@/lib/tmdb";

// "Leaving soon" dates come from the Streaming Availability API
// (docs.movieofthenight.com), not TMDB. Its free plan allows 1,000 lookups a
// month and then simply stops answering until the next month (no charges), so
// the daily refresh is capped at LEAVING_DAILY_LOOKUPS pages of 25 titles.

// STREAMING_AVAILABILITY_API_URL is only for trying things out against a stand-in.
const BASE = process.env.STREAMING_AVAILABILITY_API_URL || "https://api.movieofthenight.com/v4";
const DAY = 86400 * 1000;

export type LeavingDate = { service: string; leavesOn: string };

export function leavingConfigured() {
  return Boolean(process.env.STREAMING_AVAILABILITY_API_KEY);
}

// The feed only knows future dates for these services. Keys are serviceKey()
// of TMDB's names, values the feed's ids.
const FEED_IDS: Record<string, string> = {
  netflix: "netflix",
  "hbo max": "hbo",
  "amazon prime video": "prime",
  "apple tv": "apple",
  "disney plus": "disney",
  mubi: "mubi",
};

function dateOf(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

export function formatLeavesOn(leavesOn: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Date(leavesOn + "T12:00:00").toLocaleDateString("en-US", opts);
}

// Downloads the titles leaving the services any household uses in the next
// 31 days, soonest first, and stores them. Runs at most once every 20 hours
// however often the check runs, to stay inside the free plan.
export async function refreshLeaving(): Promise<{ pages: number; titles: number; note: string | null }> {
  const key = process.env.STREAMING_AVAILABILITY_API_KEY;
  if (!key) return { pages: 0, titles: 0, note: "Leaving-soon dates aren't set up (no STREAMING_AVAILABILITY_API_KEY)." };

  const last = await db.appState.findUnique({ where: { key: "leaving-refreshed" } });
  if (last && Date.now() - last.updatedAt.getTime() < 20 * 3600 * 1000) return { pages: 0, titles: 0, note: null };

  const households = await db.household.findMany({ select: { services: true } });
  const catalog = await getCatalog();
  const feedIds = new Set(
    households
      .flatMap((h) => h.services)
      .map((id) => catalog.find((p) => p.id === id))
      .map((p) => (p ? FEED_IDS[serviceKey(p.name)] : undefined))
      .filter((id): id is string => Boolean(id)),
  );
  if (feedIds.size === 0) return { pages: 0, titles: 0, note: null };

  const maxPages = Math.max(1, Number(process.env.LEAVING_DAILY_LOOKUPS) || 25);
  const startedAt = new Date();
  const now = Math.floor(startedAt.getTime() / 1000);
  const rows = new Map<string, { mediaType: MediaType; tmdbId: number; service: string; leavesOn: string }>();
  let cursor: string | undefined;
  let pages = 0;
  let finished = false;
  let reached = dateOf(now);

  while (pages < maxPages) {
    const url = new URL(`${BASE}/changes`);
    url.search = new URLSearchParams({
      country: REGION.toLowerCase(),
      change_type: "expiring",
      item_type: "show",
      catalogs: Array.from(feedIds, (id) => `${id}.subscription`).join(","),
      from: String(now),
      to: String(now + 31 * 86400),
      order_direction: "asc",
      ...(cursor ? { cursor } : {}),
    }).toString();
    const res = await fetch(url, { headers: { "X-API-Key": key, accept: "application/json" }, cache: "no-store" });
    pages++;
    if (!res.ok) {
      const note = res.status === 429 ? "The leaving-soon plan's monthly lookups are used up." : `Leaving-soon feed answered ${res.status}.`;
      console.error(note, await res.text().catch(() => ""));
      if (pages === 1) return { pages, titles: 0, note };
      break;
    }
    const data = await res.json();
    for (const change of data.changes ?? []) {
      const tmdb: string | undefined = data.shows?.[change.showId]?.tmdbId;
      const [type, id] = (tmdb ?? "").split("/");
      if ((type !== "movie" && type !== "tv") || !Number(id) || !change.timestamp || !change.service?.name) continue;
      const leavesOn = dateOf(change.timestamp);
      if (leavesOn > reached) reached = leavesOn;
      const row = { mediaType: type as MediaType, tmdbId: Number(id), service: change.service.name as string, leavesOn };
      const rowKey = `${row.mediaType}:${row.tmdbId}:${row.service}`;
      const seen = rows.get(rowKey);
      if (!seen || leavesOn < seen.leavesOn) rows.set(rowKey, row);
    }
    if (!data.hasMore) {
      finished = true;
      break;
    }
    cursor = data.nextCursor;
  }

  await mapLimit(Array.from(rows.values()), 8, (row) =>
    db.leaving.upsert({
      where: { mediaType_tmdbId_service: { mediaType: row.mediaType, tmdbId: row.tmdbId, service: row.service } },
      create: { ...row, checkedAt: startedAt },
      update: { leavesOn: row.leavesOn, checkedAt: startedAt },
    }),
  );
  // Forget dates that have passed, and ones the feed no longer lists (a
  // service sometimes renews a title). If the daily cap stopped us early,
  // only dates up to where we got to are known to be current.
  await db.leaving.deleteMany({
    where: {
      OR: [
        { leavesOn: { lt: dateOf(now) } },
        { checkedAt: { lt: startedAt }, ...(finished ? {} : { leavesOn: { lte: reached } }) },
      ],
    },
  });
  await db.appState.upsert({
    where: { key: "leaving-refreshed" },
    create: { key: "leaving-refreshed", value: startedAt.toISOString() },
    update: { value: startedAt.toISOString() },
  });
  return { pages, titles: rows.size, note: finished ? null : `Stopped after ${pages} lookups (the daily cap); later dates may be missing.` };
}

// The soonest date each title leaves one of `mine`, keyed like "tv:1399".
export async function leavingFor(titles: { mediaType: string; tmdbId: number }[], mine: Provider[]): Promise<Map<string, LeavingDate>> {
  const out = new Map<string, LeavingDate>();
  if (titles.length === 0 || mine.length === 0) return out;
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.leaving.findMany({
    where: { tmdbId: { in: Array.from(new Set(titles.map((t) => t.tmdbId))) }, leavesOn: { gte: today } },
    orderBy: { leavesOn: "asc" },
  });
  const keys = new Set(mine.map((p) => serviceKey(p.name)));
  const wanted = new Set(titles.map((t) => `${t.mediaType}:${t.tmdbId}`));
  for (const row of rows) {
    const key = `${row.mediaType}:${row.tmdbId}`;
    if (!wanted.has(key) || out.has(key) || !keys.has(serviceKey(row.service))) continue;
    out.set(key, { service: row.service, leavesOn: row.leavesOn });
  }
  return out;
}

// "today", "tomorrow", "in 5 days".
export function daysLeft(leavesOn: string) {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const days = Math.round((new Date(leavesOn + "T00:00:00Z").getTime() - today) / DAY);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}
