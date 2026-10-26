import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { emailConfigured, emailLayout, escapeHtml, sendEmail, appUrl } from "@/lib/email";
import { daysLeft, formatLeavesOn, refreshLeaving } from "@/lib/leaving";
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
    checkedAt: new Date(),
  };
  await db.showState.upsert({ where: { tmdbId }, create: { tmdbId, ...data }, update: data });
}

function episodeMessage(name: string, prev: { lastSeason: number | null; lastEpisode: number | null }, last: Episode) {
  const s = last.season_number;
  const e = last.episode_number;
  if (prev.lastSeason === null || s > prev.lastSeason) {
    return {
      kind: "new_season" as const,
      text: e > 1 ? `Season ${s} of ${name} is here (${e} episodes so far)` : `Season ${s} of ${name} has started`,
    };
  }
  const count = e - (prev.lastEpisode ?? 0);
  return {
    kind: "new_episode" as const,
    text:
      count > 1
        ? `${count} new episodes of ${name}, up to S${s} E${e}`
        : `New episode of ${name}: S${s} E${e}${last.name ? ` "${last.name}"` : ""}`,
  };
}

// The daily check. For every favorited title it asks TMDB:
//  - shows: has a newer episode come out since last time?
//  - anything: has it just arrived on one of the household's services?
// and, from the leaving-soon feed, whether a Want to watch title is about to
// leave the only one of the household's services it's on. It records an
// alert for each person who saved it, then emails them.
export async function runChecks(opts: { householdId?: string } = {}) {
  let leaving: Awaited<ReturnType<typeof refreshLeaving>>;
  try {
    leaving = await refreshLeaving();
  } catch (err) {
    leaving = { pages: 0, titles: 0, note: `Leaving-soon feed failed: ${(err as Error).message}` };
  }
  const leavingSoon = new Date(Date.now() + LEAVING_ALERT_DAYS * 86400 * 1000).toISOString().slice(0, 10);
  const leavingRows = await db.leaving.findMany({ where: { leavesOn: { gte: new Date().toISOString().slice(0, 10), lte: leavingSoon } } });

  const favorites = await db.favorite.findMany({
    where: opts.householdId ? { user: { householdId: opts.householdId } } : {},
    include: { user: { select: { householdId: true } } },
  });

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
      const alerts: Prisma.AlertCreateManyInput[] = [];
      const onServices = new Map<string, string[]>();

      for (const fav of favs) {
        const names = matchServices(availability.stream, await servicesFor(fav.user.householdId)).map((p) => p.name);
        onServices.set(fav.id, names);
        const joined = names.join(", ");
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

      if (mediaType === "tv") {
        const show = await tmdb(`/tv/${tmdbId}`, {}, { fresh: true });
        const prev = await db.showState.findUnique({ where: { tmdbId } });
        const last: Episode | null = show.last_episode_to_air ?? null;
        const isNewer =
          prev &&
          last &&
          (prev.lastSeason === null ||
            last.season_number > prev.lastSeason ||
            (last.season_number === prev.lastSeason && last.episode_number > (prev.lastEpisode ?? 0)));
        if (prev && last && isNewer) {
          const { kind, text } = episodeMessage(show.name, prev, last);
          for (const fav of favs) {
            const names = onServices.get(fav.id) ?? [];
            alerts.push({
              userId: fav.userId,
              key: `tv:${tmdbId}:s${last.season_number}e${last.episode_number}`,
              kind,
              tmdbId,
              mediaType,
              title: show.name,
              posterPath: show.poster_path ?? fav.posterPath,
              message: names.length ? `${text}, on ${joinNames(names)}` : `${text} (not on your services yet)`,
            });
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
    errors,
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
