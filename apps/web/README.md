# Still With You — Web

Private Thai-only PWA (`apps/web`). Talks to `apps/api` with a Supabase JWT (`Authorization: Bearer`). No cookies.

## Local development

From the monorepo root:

```bash
pnpm install
pnpm db:start                          # Postgres on :54322
# apply supabase/migrations (see root README: pnpm db:reset, or the psql loop)
cp .env.example .env                   # API secrets stay in the root .env
pnpm --filter @still-with-you/api dev  # http://localhost:3000, WEB_ORIGIN=http://localhost:5173
```

Web app:

```bash
cp apps/web/.env.example apps/web/.env
pnpm --filter @still-with-you/web dev  # http://localhost:5173
```

`apps/web/.env` should contain:

```
VITE_API_URL=http://localhost:3000
VITE_SUPABASE_URL=https://hazkqphgdkklsvkrhubg.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TODq1gSkK5bu8InyIJRtVQ_vB7u8zsZ
VITE_USE_MSW=false
```

The publishable key is public. Never put `SUPABASE_SERVICE_ROLE_KEY` in any `VITE_*` variable.

### Google login

The app uses `supabase-js` `signInWithOAuth({ provider: 'google' })`. The project owner must enable the Google provider in the hosted Supabase project and add `http://localhost:5173` (and the Cloudflare Pages origin) to the redirect allowlist. This repository cannot do that.

### MSW fallback

The hosted API is not deployed. If the local API is not running, set `VITE_USE_MSW=true` in `apps/web/.env` (or in the Cloudflare Pages build env). MSW handlers are shaped by contract v0.4 (`GET /v1/me`, consent, families, events).

When `VITE_USE_MSW=true`, the PWA service worker is **not** registered or generated. `sw.js` and `mockServiceWorker.js` cannot share the same scope — that clash is what produced the production “mock fail” + reload loop. A failed MSW start logs a warning and still boots `/login`; it does not reload.

## Scripts

```bash
pnpm --filter @still-with-you/web dev
pnpm --filter @still-with-you/web test
pnpm --filter @still-with-you/web lint
pnpm --filter @still-with-you/web typecheck
pnpm --filter @still-with-you/web build
```

Build contracts first if types are stale: `pnpm --filter @still-with-you/contracts build`.

## Cloudflare Pages

| Setting | Value |
|---|---|
| Root directory | repository root (workspace) |
| Build command | `pnpm install && pnpm --filter @still-with-you/contracts build && pnpm --filter @still-with-you/web build` |
| Build output | `apps/web/dist` |
| Framework preset | None (Vite) |
| SPA fallback | `apps/web/public/_redirects` → `/* /index.html 200` |

Required Pages environment variables (build-time):

- `VITE_API_URL` — public API origin (no trailing slash)
- `VITE_SUPABASE_URL` — `https://hazkqphgdkklsvkrhubg.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` — publishable key
- `VITE_USE_MSW` — `false` in production

`error-offline.webp` (and its copy) are precached by `vite-plugin-pwa` so the offline screen works without a network.

## Copy

All UI strings live in `src/copy.ts`, taken verbatim from voice-and-copy-v0.2. Missing strings are prefixed with `TODO:`.
