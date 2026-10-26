-- Runs on every start, just before `prisma db push` (see "start" in package.json).
-- Database changes that `db push` would refuse without --accept-data-loss go
-- here as exact statements, written so running them again does nothing.

-- Oct 2026: a title can be on both of a person's lists, so the uniqueness rule
-- for favorites moved from (person, title) to (person, title, list). The new
-- rule is looser than the old one, so existing rows can't break it.
DO $$
BEGIN
  IF to_regclass('public."Favorite"') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_userId_mediaType_tmdbId_list_key"
      ON "Favorite" ("userId", "mediaType", "tmdbId", "list");
    DROP INDEX IF EXISTS "Favorite_userId_mediaType_tmdbId_key";
  END IF;
END $$;
