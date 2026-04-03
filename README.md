# OT Delivery Router

Plan deliveries on a map, optimize visit order with **OSRM** (open routing), then drive the run with **GPS**, optional **voice** cues, and **offline** support.

## How it works

1. **Planner (`/planner`)** — Set a depot and stops (addresses geocode via **Nominatim**). Click **Optimize** to create a run: the server orders stops, stores the route in **Redis**, and returns ETAs plus optional **Google Maps directions** link.
2. **Driver (`/run/:id`)** — Full-screen map with the planned polyline (green, dashed), your position, and stop status buttons. Turn on **● GPS** to record a **cyan** trail of real GPS fixes (saved on the device). **Route AI** can call multiple no-key model APIs directly in-app, merge their responses, and return a concise operational answer.
3. **Embed (`/embed/:id`)** — Lightweight status card for iframes.

Data sources: OpenStreetMap tiles, OSRM public demo, Nominatim (please respect rate limits).

## Docs

- **[PRODUCTION.md](./PRODUCTION.md)** — What you need to configure to ship (env vars, Redis, HMAC, optional voice).

## Local run

```bash
npm install
cp .env.example .env.local
# edit .env.local — see PRODUCTION.md
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (redirects to `/planner`).

## External website integration

- Protected API: `POST /api/v1/runs` requires HMAC headers (`x-signature`, `x-timestamp`).
- Public compatibility endpoint: `POST /api/delivery/start-run` auto-signs server-side and forwards to `/api/v1/runs`.
- For browser calls from another domain, add that origin to `ALLOWED_ORIGINS`.

## License / third parties

Not affiliated with OpenStreetMap, OSRM, Nominatim, Google, or listed AI sites. External chats have their own terms and quotas.
