# Rank Up

A single-page app for a chess coach: students, sessions, schedule, repertoire,
assignments, tournaments, games and payments, with an app for students and
parents.

The whole app lives in `index.html` and runs in two places:

- **On the web** (GitHub Pages + Supabase), at https://reemshr1.github.io/Chess-Coach-app/. Everyone signs in with an email and a
  password. The data is stored in Supabase, in one `docs` table with access
  rules: the coach can do everything; students and parents read only their own
  pages and can only send messages to the coach. The first account to sign in
  on a fresh install is asked whether it is the coach.
- **As a claude.ai artifact.** There it uses the artifact's own storage instead.

## Files

- `index.html` — the app. The Supabase project address and public key are near
  `const SUPABASE` (both are meant to be public).
- `supabase/schema.sql` — creates the tables and access rules. Run it once in
  Supabase → SQL Editor; running it again is safe.
- `vendor/supabase.js` — the Supabase browser library (supabase-js 2.117.2, MIT).
- `manifest.webmanifest`, `sw.js`, `icons/` — let phones install the app from
  the browser ("Add to Home Screen").
- Publishing: GitHub Pages serves the `live` branch. Work happens on other
  branches; merging into `live` publishes it. `.nojekyll` makes Pages serve the
  files exactly as they are.
- `netlify.toml` — the earlier Netlify hosting (rank-up-chess.netlify.app),
  which now shows a "moved" notice.
