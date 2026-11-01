import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { emailConfigured, emailLayout, escapeHtml, sendEmail, appUrl } from "@/lib/email";
import { ALERT_LISTS } from "@/lib/favorites";
import { automaticLevel, isAlertLevel, type AlertLevel } from "@/lib/alert-levels";
import { daysLeft, formatLeavesOn, refreshLeaving } from "@/lib/leaving";
import { syncAllLetterboxd } from "@/lib/letterboxd";
import { getHouseholdServices, matchServices, serviceKey } from "@/lib/services";
import { getAvailability, imageUrl, mapLimit, tmdb, type MediaType, type Provider } from "@/lib/tmdb";

// How many days ahead "leaving soon" alerts are sent.
const LEAVING_ALERT_DAYS = 7;

type Episode = { season_number: number; episode_number: number; air_date: string | null; name: string };

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Remembers the latest episode of a show without sending anything, so that
// only episodes released after someone favorites it trigger an alert.
export async function recordShowState(tmdbId: number) {
  const show = await tmdb(`/tv/${tmdbId}`, {}, { fresh: true });
  await saveShowState(tmdbId, show);
}

async function saveShowState(tmdbId: number, show: any) {
  const last: Episode | null = show.last_episode_to_air ?? null;
  const next: Episode | null = show.next_episode_to_air ?? null;
  const data = {
    name: show.name ?? "Untitled",
    lastSeason: last?.season_number ?? null,
    lastEpisode: last?.episode_number ?? null,
    lastAirDate: last?.air_date ?? null,
    nextSeason: next?.season_number ?? null,
    nextEpisode: next?.episode_number ?? null,
    nextAirDate: next?.air_date ?? null,
    status: show.status ?? null,
    type: show.type ?? null,
    checkedAt: new Date(),
  };
  await db.showState.upsert({ where: { tmdbId }, create: { tmdbId, ...data }, update: data });
}

// New episodes of a show go into one alert per person that grows ("4 new
// episodes of ...") until they've seen it, rather than one alert each.
async function recordEpisodeNews(
  fav: { userId: string; posterPath: string | null },
  show: { id: number; name: string; poster_path?: string | null },
  last: Episode,
  isNewSeason: boolean,
  count: number,
  services: string[],
) {
  const open = await db.alert.findFirst({
    where: { userId: fav.userId, mediaType: "tv", tmdbId: show.id, readAt: null, kind: { in: ["new_season", "new_episode"] } },
    orderBy: { createdAt: "desc" },
  });
  const s = last.season_number;
  const e = last.episode_number;
  const sameSeason = open?.key.startsWith(`tv:${show.id}:s${s}e`);
  const kind = isNewSeason || (open?.kind === "new_season" && sameSeason) ? "new_season" : "new_episode";
  const episodes = kind === "new_season" ? e : (open?.kind === "new_episode" && sameSeason ? open.episodes ?? 1 : 0) + count;
  const text =
    kind === "new_season"
      ? e > 1
        ? `Season ${s} of ${show.name}: ${e} episodes out so far`
        : `Season ${s} of ${show.name} has started`
      : episodes > 1
        ? `${episodes} new episodes of ${show.name}, latest S${s} E${e}`
        : `New episode of ${show.name}: S${s} E${e}${last.name && !/^Episode \d+$/.test(last.name) ? ` "${last.name}"` : ""}`;
  const data = {
    key: `tv:${show.id}:s${s}e${e}`,
    kind,
    episodes,
    title: show.name,
    posterPath: show.poster_path ?? fav.posterPath,
    message: services.length ? `${text}, on ${joinNames(services)}` : `${text} (not on your services yet)`,
  };
  try {
    if (open) {
      // Moves to the top again and goes in the next email with the new count.
      await db.alert.update({ where: { id: open.id }, data: { ...data, createdAt: new Date(), emailedAt: null } });
    } else {
      await db.alert.create({ data: { ...data, userId: fav.userId, tmdbId: show.id, mediaType: "tv" } });
    }
    return 1;
  } catch {
    return 0; // already recorded (same key)
  }
}

// The daily check. For every favorited title it asks TMDB:
//  - shows: has a newer episode come out since last time? (Only episodes on
//    the household's services, grouped per show, and only new seasons for
//    talk/news shows or anyone who chose that on the show's page.)
//  - anything: has it just arrived on one of the household's services?
// and, from the leaving-soon feed, whether a Want to watch title is about to
// leave the only one of the household's services it's on. It records an
// alert for each person who saved it, then emails them.
export async function runChecks(opts: { householdId?: string } = {}) {
  // New films logged on Letterboxd first, so they're on the lists below.
  let letterboxd: Awaited<ReturnType<typeof syncAllLetterboxd>>;
  try {
    letterboxd = await syncAllLetterboxd(opts.householdId);
  } catch (err) {
    letterboxd = { people: 0, films: 0, errors: [`Letterboxd: ${(err as Error).message}`] };
  }
  let leaving: Awaited<ReturnType<typeof refreshLeaving>>;
  try {
    leaving = await refreshLeaving();
  } catch (err) {
    leaving = { pages: 0, titles: 0, note: `Leaving-soon feed failed: ${(err as Error).message}` };
  }
  const leavingSoon = new Date(Date.now() + LEAVING_ALERT_DAYS * 86400 * 1000).toISOString().slice(0, 10);
  const leavingRows = await db.leaving.findMany({ where: { leavesOn: { gte: new Date().toISOString().slice(0, 10), lte: leavingSoon } } });

  const favorites = await db.favorite.findMany({
    where: { list: { in: ALERT_LISTS }, ...(opts.householdId ? { user: { householdId: opts.householdId } } : {}) },
    include: { user: { select: { householdId: true } } },
  });

  const settings = new Map(
    (await db.showAlertSetting.findMany({ where: { userId: { in: Array.from(new Set(favorites.map((f) => f.userId))) } } })).map((a) => [
      `${a.userId}:${a.tmdbId}`,
      a.level,
    ]),
  );

  const servicesCache = new Map<string, Promise<Provider[]>>();
  const servicesFor = (householdId: string) => {
    if (!servicesCache.has(householdId)) servicesCache.set(householdId, getHouseholdServices(householdId));
    return servicesCache.get(householdId)!;
  };

  const byTitle = new Map<string, typeof favorites>();
  // Want-to-watch entries first: a title on both of someone's lists makes the
  // same alert twice, and only the first is kept, so it gets the wording that
  // mentions Want to watch.
  for (const fav of favorites.sort((a, b) => Number(b.list === "want") - Number(a.list === "want"))) {
    const key = `${fav.mediaType}:${fav.tmdbId}`;
    byTitle.set(key, [...(byTitle.get(key) ?? []), fav]);
  }

  const today = new Date().toISOString().slice(0, 10);
  let alertsCreated = 0;
  const errors: string[] = [];

  await mapLimit(Array.from(byTitle.values()), 4, async (favs) => {
    const { tmdbId } = favs[0];
    const mediaType = favs[0].mediaType as MediaType;
    try {
      const availability = await getAvailability(mediaType, tmdbId, { fresh: true });
      const show = mediaType === "tv" ? await tmdb(`/tv/${tmdbId}`, {}, { fresh: true }) : null;
      const levelFor = (userId: string): AlertLevel => {
        if (!show) return "episodes";
        const chosen = settings.get(`${userId}:${tmdbId}`);
        return isAlertLevel(chosen) ? chosen : automaticLevel(show.type);
      };
      const alerts: Prisma.AlertCreateManyInput[] = [];
      const onServices = new Map<string, string[]>();

      for (const fav of favs) {
        const names = matchServices(availability.stream, await servicesFor(fav.user.householdId)).map((p) => p.name);
        onServices.set(fav.id, names);
        const joined = names.join(", ");
        if (levelFor(fav.userId) === "off") {
          if (fav.availableOn !== joined) await db.favorite.update({ where: { id: fav.id }, data: { availableOn: joined } });
          continue;
        }
        // Only "arrived" when we'd checked before and it wasn't on any of them.
        if (fav.availableOn === "" && joined) {
          alerts.push({
            userId: fav.userId,
            key: `${mediaType}:${tmdbId}:streaming:${today}`,
            kind: "now_streaming",
            tmdbId,
            mediaType,
            title: fav.title,
            posterPath: fav.posterPath,
            message:
              fav.list === "want"
                ? `${fav.title}, from your Want to watch list, is now streaming on ${joinNames(names)}`
                : `${fav.title} is now streaming on ${joinNames(names)}`,
          });
        }
        // Leaving soon: only for Want to watch, and only if it isn't staying
        // on another of the household's services.
        const goingFrom = leavingRows.filter(
          (l) => l.mediaType === mediaType && l.tmdbId === tmdbId && names.some((n) => serviceKey(n) === serviceKey(l.service)),
        );
        const staying = names.filter((n) => !goingFrom.some((l) => serviceKey(l.service) === serviceKey(n)));
        if (fav.list === "want" && goingFrom.length > 0 && staying.length === 0) {
          const last = goingFrom.reduce((a, b) => (a.leavesOn > b.leavesOn ? a : b));
          alerts.push({
            userId: fav.userId,
            key: `${mediaType}:${tmdbId}:leaving:${last.leavesOn}`,
            kind: "leaving_soon",
            tmdbId,
            mediaType,
            title: fav.title,
            posterPath: fav.posterPath,
            message: `${fav.title}, from your Want to watch list, leaves ${joinNames(goingFrom.map((l) => l.service))} ${daysLeft(
              last.leavesOn,
            )} (last day ${formatLeavesOn(last.leavesOn, { weekday: "short", month: "short", day: "numeric" })})`,
          });
        }
        if (fav.availableOn !== joined) {
          await db.favorite.update({ where: { id: fav.id }, data: { availableOn: joined } });
        }
      }

      if (show) {
        const prev = await db.showState.findUnique({ where: { tmdbId } });
        const last: Episode | null = show.last_episode_to_air ?? null;
        const isNewer =
          prev &&
          last &&
          (prev.lastSeason === null ||
            last.season_number > prev.lastSeason ||
            (last.season_number === prev.lastSeason && last.episode_number > (prev.lastEpisode ?? 0)));
        if (prev && last && isNewer) {
          const isNewSeason = prev.lastSeason === null || last.season_number > prev.lastSeason;
          const count = isNewSeason ? last.episode_number : last.episode_number - (prev.lastEpisode ?? 0);
          const told = new Set<string>(); // a title on both lists is one person
          for (const fav of favs) {
            if (told.has(fav.userId)) continue;
            told.add(fav.userId);
            const level = levelFor(fav.userId);
            const names = onServices.get(fav.id) ?? [];
            // Episodes only matter if you can watch them; seasons are news either way.
            if (level === "off" || (!isNewSeason && (level === "seasons" || names.length === 0))) continue;
            const added = await recordEpisodeNews(fav, { ...show, id: tmdbId }, last, isNewSeason, count, names);
            alertsCreated += added;
          }
        }
        await saveShowState(tmdbId, show);
      }

      if (alerts.length) {
        const result = await db.alert.createMany({ data: alerts, skipDuplicates: true });
        alertsCreated += result.count;
      }
    } catch (err) {
      errors.push(`${mediaType}:${tmdbId}: ${(err as Error).message}`);
    }
  });

  const email = await sendEmailDigests(opts.householdId);
  return {
    titlesChecked: byTitle.size,
    alertsCreated,
    emailsSent: email.sent,
    emailNote: email.note,
    leaving: { lookups: leaving.pages, titles: leaving.titles, note: leaving.note },
    letterboxd: { people: letterboxd.people, films: letterboxd.films },
    errors: [...letterboxd.errors, ...errors],
  };
}

// One email per person listing their alerts that haven't been emailed yet.
// Alerts older than a week are left out, so turning email on later doesn't
// send a pile of old news.
export async function sendEmailDigests(householdId?: string) {
  if (!emailConfigured()) return { sent: 0, note: "Email isn't set up (no RESEND_API_KEY)." };
  const since = new Date(Date.now() - 7 * 86400 * 1000);
  const pending = { emailedAt: null, createdAt: { gte: since } };
  const users = await db.user.findMany({
    where: { emailAlerts: true, ...(householdId ? { householdId } : {}), alerts: { some: pending } },
    include: { alerts: { where: pending, orderBy: { createdAt: "desc" } } },
  });

  let sent = 0;
  for (const user of users) {
    const items = user.alerts
      .map((a) => {
        const poster = imageUrl(a.posterPath, "w92");
        const link = appUrl(`/title/${a.mediaType}/${a.tmdbId}`);
        return `<tr><td style="padding:8px 12px 8px 0;vertical-align:top">${
          poster ? `<img src="${poster}" width="46" style="border-radius:4px" alt="">` : ""
        }</td><td style="padding:8px 0;vertical-align:middle"><a href="${link}" style="color:#16181d;font-weight:600;text-decoration:none">${escapeHtml(
          a.message,
        )}</a></td></tr>`;
      })
      .join("");
    const count = user.alerts.length;
    try {
      await sendEmail(
        user.email,
        count === 1 ? user.alerts[0].message : `${count} updates on your shows and movies`,
        emailLayout(`New for you, ${user.name}`, `<table style="border-collapse:collapse">${items}</table>`),
      );
      await db.alert.updateMany({ where: { id: { in: user.alerts.map((a) => a.id) } }, data: { emailedAt: new Date() } });
      sent++;
    } catch (err) {
      console.error(`Email to user ${user.id} failed:`, err);
    }
  }
  return { sent, note: null };
}
