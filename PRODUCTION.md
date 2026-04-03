# Production checklist

Everything below is **your responsibility** on the host (e.g. Vercel). This app avoids paid **AI** API keys: “Route AI” calls no-key AI endpoints directly, then merges model outputs into one concise answer.

## Required

| Item | Why |
|------|-----|
| **Node 20+** | Matches Next.js 15 |
| **Redis** | Stores runs, geocode/OSRM caches |
| `REDIS_URL` | Full Redis connection string (`redis://...`) |
| `HMAC_SECRET` | **Required in production.** Strong random string used server-side to sign and verify protected API calls. In `next dev` only, middleware falls back to `dev-secret` if unset. |
| `ALLOWED_ORIGINS` | Comma-separated origins for CORS (e.g. `https://yourdomain.com`) |

## Optional

| Item | Notes |
|------|--------|
| `ELEVENLABS_API_KEY` | Voice alerts use `/api/v1/voice/alert`. Without it, the client falls back to the browser’s speech synth where possible. |
| `NOMINATIM_COUNTRY_CODES` | e.g. `np` to bias geocoding (server-side). |
| `GOOGLE_MAPS_API_KEY` | Optional server-side fallback geocoder for more accurate address matches when Nominatim has no hit. |
| `NEXT_PUBLIC_NOMINATIM_COUNTRY_CODES` | Same for the planner’s `/geocode` requests from the browser. |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL if you generate absolute links. |
| `NEXT_PUBLIC_OFFLINE_SW` | Set `1` to register the service worker in `next dev` (normally **production only**). |

## Deploy (Vercel)

1. Connect the repo; set **all** required env vars in Project → Settings → Environment Variables.  
2. Set `REDIS_URL` from your Redis provider (Upstash, Redis Cloud, self-hosted, etc.).  
3. `vercel --prod` or push to `main`.  
4. After first deploy, open a run once on a **phone** while online so offline caches + snapshots can warm up.

## Security notes

- Unsigned `GET /api/v1/runs/:id` is intentional for embeds and driver links. Treat `runId` as an unguessable secret (UUID).  
- Rotate `HMAC_SECRET` if it leaks; old signatures stop working.  
- Do **not** commit `.env.local`.

## Fair use of free services

- **OSRM** public instance is rate-limited; heavy fleets should self-host or use a paid router.  
- **Nominatim**: **1 request/second** per app; this codebase queues and caches.  
- **No-key AI APIs** can change limits, latency, or model availability without notice. Keep manual chat links as fallback in case a provider is down.

## PWA / offline

- Service worker caches static assets, last successful `GET` run payload, and some map tiles (bounded).  
- Driver stop updates queue locally if offline and sync when back online (see `lib/offline-run.ts`).  
- GPS recording is stored under `localStorage` key `ot-live-gps:<runId>`.
