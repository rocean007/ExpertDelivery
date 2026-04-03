# Production checklist

Everything below is **your responsibility** on the host (e.g. Vercel). This app avoids paid **AI** APIs: “route insight” only copies a prompt to your clipboard and links to public chat sites.

## Required

| Item | Why |
|------|-----|
| **Node 20+** | Matches Next.js 15 |
| **Vercel KV** (or compatible Redis REST) | Stores runs, geocode/OSRM caches |
| `KV_REST_API_URL` | From Vercel Storage → KV |
| `KV_REST_API_TOKEN` | Same |
| `HMAC_SECRET` | Strong random string; server validates signed `POST` / `PATCH` / `DELETE` on `/api/v1/runs` and voice |
| `ALLOWED_ORIGINS` | Comma-separated origins for CORS (e.g. `https://yourdomain.com`) |

## Optional

| Item | Notes |
|------|--------|
| `ELEVENLABS_API_KEY` | Voice alerts use `/api/v1/voice/alert`. Without it, the client falls back to the browser’s speech synth where possible. |
| `NOMINATIM_COUNTRY_CODES` | e.g. `np` to bias geocoding (server-side). |
| `NEXT_PUBLIC_NOMINATIM_COUNTRY_CODES` | Same for the planner’s `/geocode` requests from the browser. |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL if you generate absolute links. |
| `NEXT_PUBLIC_HMAC_SECRET` | **Dev / demos only** — must match `HMAC_SECRET` if the planner signs requests in the browser. For production, prefer a server signing endpoint so the secret never ships to clients. |
| `NEXT_PUBLIC_OFFLINE_SW` | Set `1` to register the service worker in `next dev` (normally **production only**). |

## Deploy (Vercel)

1. Connect the repo; set **all** required env vars in Project → Settings → Environment Variables.  
2. Create a **KV** database and paste REST URL + token.  
3. `vercel --prod` or push to `main`.  
4. After first deploy, open a run once on a **phone** while online so offline caches + snapshots can warm up.

## Security notes

- Unsigned `GET /api/v1/runs/:id` is intentional for embeds and driver links. Treat `runId` as an unguessable secret (UUID).  
- Rotate `HMAC_SECRET` if it leaks; old signatures stop working.  
- Do **not** commit `.env.local`.

## Fair use of free services

- **OSRM** public instance is rate-limited; heavy fleets should self-host or use a paid router.  
- **Nominatim**: **1 request/second** per app; this codebase queues and caches.  
- **AI links** in the UI are plain HTTPS homepages, alphabetical, no affiliates. Limits are defined by each provider.

## PWA / offline

- Service worker caches static assets, last successful `GET` run payload, and some map tiles (bounded).  
- Driver stop updates queue locally if offline and sync when back online (see `lib/offline-run.ts`).  
- GPS recording is stored under `localStorage` key `ot-live-gps:<runId>`.
