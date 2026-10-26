# Watchlist

One place for everything on the household's streaming services: browse and
search across all of them, favorite shows and movies, get alerts (in the app
and by email) when a favorite show has a new season or episode or a favorite
arrives on one of your services, and get recommendations based on favorites.

## How it works
- Title information, where-to-watch and "similar titles" come from **TMDB**
  (themoviedb.org); TMDB's where-to-watch data comes from JustWatch. Streaming
  services don't let outside apps see your accounts, so the app doesn't know
  your watch history: favorites are how it learns your taste.
- Our own data (households, services, favorites, alerts) lives in Postgres.
- No passwords: to sign in or sign up you get a 6-digit code by email (sent through Resend). On your computer without Resend set up, the code prints in the terminal running `npm run dev`.
- Once a day a Railway cron job calls `/api/cron/check`, which looks for new
  episodes and new arrivals, records alerts, and emails a summary through Resend.

## Running it on your computer
1. `cp .env.example .env` and fill in the values (see comments in the file).
2. `npm install`
3. `npm run db:push` creates the tables. Use `db:push`, never `prisma migrate dev`.
4. `npm run dev` and open http://localhost:3000

## Pages
- `/` Home: alerts, upcoming episodes, popular and just-released on each service
- `/browse` Filter by service, shows or movies, genre and sort
- `/search` Search across all services; shows which of yours has each title
- `/title/[tv|movie]/[id]` Details, where to watch, next episode, similar titles
- `/favorites`, `/for-you` (recommendations), `/settings`
