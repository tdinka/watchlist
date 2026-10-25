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

## Rules
- Service matching goes through `serviceKey()` in `src/lib/services.ts` (TMDB lists "Netflix Standard with Ads", "HBO Max Amazon Channel" etc. separately). Change name rules there only.
- Colours in `tailwind.config.ts`: gold `marquee` only for actions, always behind dark text; green `live` only means "on your service"; coral `flare` only marks something new.
- Use `prisma db push`, never `prisma migrate dev`. Back up `.env` before reorganizing files.
- Next.js 14.2: don't combine `useSearchParams` + `Suspense` + `force-dynamic`; pages read `searchParams` props instead.
- New public routes must be excluded in `src/middleware.ts`.
