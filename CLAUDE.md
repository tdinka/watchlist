# Watchlist — notes for Claude Code

Household app that pulls together what's on the streaming services they subscribe to: browse and search across services, favorites, new-season/episode alerts (in-app + email), recommendations.

## About the owner
- Tsega is early in their technical journey. Explain what you're doing in plain language, one step at a time, and say clearly when Tsega needs to do something themselves.
- Run GitHub/Railway setup directly with the signed-in `gh` and `railway` CLIs. Before any commit or push, say which files are included and the message. Never force-push.

## Stack (same as Family Recipe Box)
- Next.js 14 (App Router, TypeScript) + Tailwind; Postgres + Prisma; NextAuth credentials provider used for passwordless sign-in: a 6-digit code emailed to the person (`src/lib/login-codes.ts`, `/api/auth/request-code`); households with invite codes. No passwords. Sign-up details ride on the code and the account is only created when the code is entered. Without `RESEND_API_KEY`, codes print in the dev server's terminal (never in production).
- TMDB API for all title data (`src/lib/tmdb.ts`); credit TMDB and JustWatch wherever where-to-watch data shows (footer in `layout.tsx`).
- Resend for email (`src/lib/email.ts`): sign-in codes and alert emails. Required in production, since sign-in codes go by email.
- Daily check: `src/lib/alerts.ts` `runChecks()`, called by `/api/cron/check` with `CRON_SECRET`.
- Two independent lists per person (`Favorite.list`): "want" (Want to watch) and "loved" (watched and liked). A title can be on both, with one `Favorite` row per list (unique on user + title + list); `SaveButtons` toggles each list on its own. The daily check sorts Want rows first so a title on both lists gets one alert, worded for Want to watch. Recommendations come from Loved only; alerts cover both; Home shows Want-to-watch titles that are on the household's services. The page is "My lists" at `/favorites`.
- Bulk favorites: `/import` reads a Netflix viewing-history CSV in the browser (`src/lib/netflix.ts` groups episodes into shows) or a typed list, matches names via TMDB search (`src/lib/matching.ts`), and the person ticks what to add. `/welcome` is the pick-what-you-love grid shown after sign-up. Netflix imports and the pick grid go to Loved; a typed list lets the person choose. All adding goes through `addFavorites()` in `src/lib/favorites.ts`, which also records availability and each show's latest episode (so imports don't trigger alerts for old episodes).
- Leaving soon: dates come from the Streaming Availability API (movieofthenight.com, key in `STREAMING_AVAILABILITY_API_KEY`, sent as `X-API-Key`), not TMDB. `src/lib/leaving.ts` `refreshLeaving()` downloads the "expiring" feed (`/v4/changes`, next 31 days, the household services' subscription catalogs, soonest first) into the `Leaving` table, at most once every 20 hours and at most `LEAVING_DAILY_LOOKUPS` (default 25) pages. Free plan: 1,000 lookups a month, hard limit with no charges. Alerts go out 7 days ahead, for Want to watch titles that aren't staying on another of the household's services. Lilac (`ebb`) is the "leaving" colour. Without the key, nothing about leaving shows.
- Region is US (`WATCH_REGION`). Default services: Netflix, HBO Max, Prime Video, Apple TV+.

## Hosting (Railway project "watchlist", set up Oct 2026)
- Live at https://watchlist-production-9926.up.railway.app. Repo: GitHub `tdinka/watchlist` (private). Pushing to `main` deploys automatically.
- Services: `watchlist` (the app), `Postgres` (no public URL; tables are created by `npm start`), `daily-check` (curl image; cron `0 14 * * *` = 7am Pacific; POSTs to `/api/cron/check` with `CRON_SECRET`, which it references from the app's variables).
- `railway environment edit --service-config` answered "No changes to apply" for deploy settings (CLI 5.63 and 5.71). The cron schedule and start command were set through Railway's GraphQL API (`serviceInstanceUpdate`) with the CLI's signed-in token; a Cloudflare 1010 error means the request needs a `user-agent` header.
- Email: Resend key "Watchlist" (sending only, tsegadinka.com) in `RESEND_API_KEY`; `EMAIL_FROM` is `Watchlist <watchlist@tsegadinka.com>`. tsegadinka.com was already verified in Resend for the Date Jar. Live sign-in by emailed code confirmed working Oct 2026.
- Local dev has no lasting database; the Railway one isn't reachable from outside.

## Rules
- Service matching goes through `serviceKey()` in `src/lib/services.ts` (TMDB lists "Netflix Standard with Ads", "HBO Max Amazon Channel" etc. separately). Change name rules there only.
- Colours in `tailwind.config.ts`: gold `marquee` only for actions, always behind dark text; green `live` only means "on your service"; coral `flare` only marks something new.
- Use `prisma db push`, never `prisma migrate dev`. On Railway, `npm start` runs `prisma db push` before starting, so schema changes apply on deploy (it refuses changes that would lose data, and the deploy fails instead). Never put `--accept-data-loss` in `start`. A change `db push` would refuse but that is safe goes in `prisma/before-push.sql` as exact, re-runnable SQL, which `start` runs first; test it on a fresh database with the old layout before pushing. The Railway Postgres has no public URL. Back up `.env` before reorganizing files.
- Next.js 14.2: don't combine `useSearchParams` + `Suspense` + `force-dynamic`; pages read `searchParams` props instead.
- New public routes must be excluded in `src/middleware.ts`.
