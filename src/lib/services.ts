import { db } from "@/lib/db";
import { getAvailability, getProviderCatalog, mapLimit, type MediaType, type Provider } from "@/lib/tmdb";

// Used if TMDB can't be reached, so pages still know the default services' names.
const FALLBACK: Provider[] = [
  { id: 8, name: "Netflix", logoPath: null, priority: 1 },
  { id: 9, name: "Amazon Prime Video", logoPath: null, priority: 2 },
  { id: 1899, name: "HBO Max", logoPath: null, priority: 3 },
  { id: 350, name: "Apple TV+", logoPath: null, priority: 4 },
];

// TMDB lists the same service several ways: "Netflix Standard with Ads",
// "HBO Max Amazon Channel", "Apple TV+" vs "Apple TV". This boils a name down
// so that all of those count as the service you subscribe to.
export function serviceKey(name: string) {
  const key = name
    .toLowerCase()
    .replace(/\b(amazon|apple tv|roku premium|youtube tv)?\s*channels?\b/g, "")
    .replace(/\b(standard|basic|premium)?\s*with ads\b/g, "")
    .replace(/\+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const aliases: Record<string, string> = { max: "hbo max", "prime video": "amazon prime video" };
  return aliases[key] ?? key;
}

// Which of `mine` appear among the services a title is streaming on.
export function matchServices(stream: Provider[], mine: Provider[]): Provider[] {
  const keys = new Set(stream.map((p) => serviceKey(p.name)));
  return mine.filter((p) => keys.has(serviceKey(p.name)));
}

export async function getCatalog(): Promise<Provider[]> {
  try {
    return await getProviderCatalog();
  } catch {
    return FALLBACK;
  }
}

export async function getHouseholdServices(householdId: string): Promise<Provider[]> {
  const household = await db.household.findUnique({ where: { id: householdId }, select: { services: true } });
  const ids = household?.services ?? [];
  const catalog = await getCatalog();
  return ids
    .map((id) => catalog.find((p) => p.id === id) ?? FALLBACK.find((p) => p.id === id))
    .filter((p): p is Provider => Boolean(p));
}

// The household's services each title is on, keyed "tv:123". A failed lookup
// just leaves that title without badges.
export async function servicesForTitles(
  titles: { id: number; mediaType: MediaType }[],
  mine: Provider[],
): Promise<Map<string, Provider[]>> {
  const found = await mapLimit(titles, 8, async (t): Promise<[string, Provider[]]> => {
    try {
      const availability = await getAvailability(t.mediaType, t.id);
      return [`${t.mediaType}:${t.id}`, matchServices(availability.stream, mine)];
    } catch {
      return [`${t.mediaType}:${t.id}`, []];
    }
  });
  return new Map(found);
}
