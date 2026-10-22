# Still With You — Web

Private Thai-only PWA (`apps/web`). Talks to `apps/api` with a Supabase JWT (`Authorization: Bearer`). No cookies.

## Local development

From the monorepo root:

```bash
pnpm install
pnpm db:start                          # Postgres on :54322
# apply supabase/migrations (see root README: pnpm db:reset, or the psql loop)
cp .env.example .env                   # API secrets stay in the root .env
pnpm --filter @still-with-you/api dev  # http://localhost:3000; WEB_ORIGIN is a comma-separated CORS allowlist (e.g. http://localhost:5173)
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

The app uses `supabase-js` `signInWithOAuth({ provider: 'google' })` with **PKCE** (`flowType: 'pkce'`, `detectSessionInUrl: true`). `redirectTo` is `${origin}/auth/callback` (not the bare origin). `/auth/callback` waits for `getSession()` — which awaits the `?code=` exchange — before any `<Navigate>` that would strip the query or hash.

Supabase dashboard (Authentication → URL configuration). This repo cannot change it:

| Setting | Value |
|---|---|
| Site URL | `https://still-with-you-5b1.pages.dev` (root — **not** `/login`) |
| Redirect URLs | keep `https://still-with-you-5b1.pages.dev/**` and `http://localhost:5173/**`. Optional exact rows: `https://still-with-you-5b1.pages.dev/auth/callback`, `http://localhost:5173/auth/callback` |

Site URL is only the fallback when `redirectTo` is omitted or rejected. `…/login` as Site URL still works if the `/**` allowlist covers `/auth/callback`, but root is the safer default. No Implicit/PKCE toggle is required; the client sends a code challenge.

MSW handlers do not mock `*.supabase.co`. The worker starts with `onUnhandledRequest: 'bypass'` and an explicit `passthrough()` for the project URL so the PKCE `POST /auth/v1/token` is not swallowed. Auth `initialize()` runs **after** MSW is listening.

### MSW fallback

The hosted API is not deployed. If the local API is not running, set `VITE_USE_MSW=true` in `apps/web/.env` (or in the Cloudflare Pages build env). MSW handlers are shaped by contract v0.4 (`GET /v1/me`, consent, families, events).

When `VITE_USE_MSW=true`:

- VitePWA is disabled (`loadEnv` + `process.env`) and leftover `manifest.webmanifest` / `workbox-*` files are stripped from `dist`. `public/sw.js` is a tombstone (unregister + clear caches) so a previous Workbox install can update — a missing `/sw.js` would be SPA-rewritten to `index.html` and the old worker could never be replaced.
- `virtual:pwa-register` is not imported, so `workbox-window` is not in the bundle.
- `startMocks()` unregisters every existing service worker (including a leftover Workbox `sw.js` from an older deploy and a stale `mockServiceWorker.js`) before calling `worker.start()`.
- MSW’s `location.reload()` (fired when a mock worker is registered but not yet controlling) is swallowed so `/login` cannot loop.
- `public/_headers` forces `/mockServiceWorker.js` to `application/javascript`. Do **not** add `public/_routes.json` — `include: ["/*"]` can send the worker through the Functions/SPA path and return `index.html`.
- `scripts/assert-dist.mjs` fails the build if either worker is missing/HTML, or if an MSW build still contains `manifest.webmanifest` or a Workbox `sw.js`.

A failed MSW start logs a warning and still boots `/login`; it does not reload.

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
| Build command | `pnpm install --frozen-lockfile && pnpm --filter "./packages/*" build && pnpm --filter @still-with-you/web build` |
| Build output | `apps/web/dist` |
| Framework preset | None (Vite) |
| SPA fallback | `apps/web/public/_redirects` → `/* /index.html 200` (static files win; no self-rewrites, no `_routes.json`) |

Required Pages environment variables (build-time):

- `VITE_API_URL` — public API origin (no trailing slash)
- `VITE_SUPABASE_URL` — `https://hazkqphgdkklsvkrhubg.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` — publishable key
- `VITE_USE_MSW` — `true` until the hosted API exists (`false` once `/v1` is deployed)

When `VITE_USE_MSW` is not `true`, `error-offline.webp` (and its copy) are precached by `vite-plugin-pwa` so the offline screen works without a network.

## Copy

All UI strings live in `src/copy.ts`, taken verbatim from voice-and-copy-v0.3 (Eddy) plus the first-PR key mapping. Missing strings are prefixed with `TODO:`.

Visual tokens live in `src/index.css` from Design System v1: primary `#4A7768` (hover `#3F6659`, pressed `#355649`), input border `#858C87`, 2px `#4A7768` focus ring, body 16/26, inputs ≥16px, touch targets ≥44px.
