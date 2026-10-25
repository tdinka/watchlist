# Watchlist — notes for Claude Code

Household app that pulls together what's on the streaming services they subscribe to: browse and search across services, favorites, new-season/episode alerts (in-app + email), recommendations.

## About the owner
- Tsega is early in their technical journey. Explain what you're doing in plain language, one step at a time, and say clearly when Tsega needs to do something themselves.
- Run GitHub/Railway setup directly with the signed-in `gh` and `railway` CLIs. Before any commit or push, say which files are included and the message. Never force-push.

## Stack (same as Family Recipe Box)
- Next.js 14 (App Router, TypeScript) + Tailwind; Postgres + Prisma; NextAuth credentials, households with invite codes.
- TMDB API for all title data (`src/lib/tmdb.ts`); credit TMDB and JustWatch wherever where-to-watch data shows (footer in `layout.tsx`).
- Resend for email (`src/lib/email.ts`); optional, app works without it.
- Daily check: `src/lib/alerts.ts` `runChecks()`, called by `/api/cron/check` with `CRON_SECRET`.
- Region is US (`WATCH_REGION`). Default services: Netflix, HBO Max, Prime Video, Apple TV+.

## Hosting (Railway project "watchlist", set up Oct 2026)
- Live at https://watchlist-production-9926.up.railway.app. Repo: GitHub `tdinka/watchlist` (private). Pushing to `main` deploys automatically.
- Services: `watchlist` (the app), `Postgres` (no public URL; tables are created by `npm start`), `daily-check` (curl image; cron `0 14 * * *` = 7am Pacific; POSTs to `/api/cron/check` with `CRON_SECRET`, which it references from the app's variables).
- `railway environment edit --service-config` answered "No changes to apply" for deploy settings (CLI 5.63 and 5.71). The cron schedule and start command were set through Railway's GraphQL API (`serviceInstanceUpdate`) with the CLI's signed-in token; a Cloudflare 1010 error means the request needs a `user-agent` header.
- Not set yet: `RESEND_API_KEY` / `EMAIL_FROM` (email alerts). Local dev has no database yet; the Railway one isn't reachable from outside.

## Rules
- Service matching goes through `serviceKey()` in `src/lib/services.ts` (TMDB lists "Netflix Standard with Ads", "HBO Max Amazon Channel" etc. separately). Change name rules there only.
- Colours in `tailwind.config.ts`: gold `marquee` only for actions, always behind dark text; green `live` only means "on your service"; coral `flare` only marks something new.
- Use `prisma db push`, never `prisma migrate dev`. On Railway, `npm start` runs `prisma db push` before starting, so schema changes apply on deploy (it refuses changes that would lose data, and the deploy fails instead). The Railway Postgres has no public URL. Back up `.env` before reorganizing files.
- Next.js 14.2: don't combine `useSearchParams` + `Suspense` + `force-dynamic`; pages read `searchParams` props instead.
- New public routes must be excluded in `src/middleware.ts`.
