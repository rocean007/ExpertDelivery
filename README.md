# OT Delivery Router

Production-ready delivery route optimization for Ocean Tarkari — built on Next.js 15 App Router, OSRM, Leaflet, and Vercel KV.

## Features

- **Route optimization**: OSRM trip API for ≤12 stops; nearest-neighbor + 2-opt TSP fallback for larger runs
- **Interactive maps**: React-Leaflet with OpenStreetMap tiles, custom markers, route polylines
- **Driver view**: Full-screen map, geolocation tracking, stop status updates
- **Voice alerts**: ElevenLabs TTS — proximity alerts at 100m, arrival at 20m, completion announcements
- **Embed widget**: Compact tracking card for iFrame embedding in host apps
- **REST API**: HMAC-signed endpoints for external e-commerce integration
- **Caching**: Vercel KV caches geocoding (24h), distance matrices (1h), polylines (6h)

## Tech Stack

- Next.js 15 App Router + TypeScript (strict, no `any`)
- Tailwind CSS v3
- Leaflet.js + React-Leaflet
- Nominatim geocoding (rate-limited to 1 req/s)
- OSRM public API (`router.project-osrm.org`)
- Vercel KV (free tier)
- ElevenLabs TTS (Adam voice)

## Quick Start

```bash
git clone <repo>
cd ot-delivery-router
npm install
cp .env.example .env.local
# Fill in your environment variables
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `HMAC_SECRET` | ✅ | Secret for request signing |
| `KV_REST_API_URL` | ✅ | Vercel KV REST URL |
| `KV_REST_API_TOKEN` | ✅ | Vercel KV token |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated CORS origins |
| `ELEVENLABS_API_KEY` | Optional | For voice alerts |
| `NEXT_PUBLIC_SITE_URL` | Optional | Your production URL |
| `NEXT_PUBLIC_HMAC_SECRET` | Dev only | Client-side signing (use server endpoint in prod) |

## API Reference

### POST /api/v1/runs

Create an optimized delivery run.

**Headers:**
```
Content-Type: application/json
x-signature: <hmac-sha256-hex>
x-timestamp: <unix-seconds>
```

**Body:**
```json
{
  "depot": {
    "label": "Main Warehouse",
    "lat": 27.7172,
    "lng": 85.3240
  },
  "stops": [
    {
      "id": "order-123",
      "label": "John Doe",
      "address": "Kathmandu 44600",
      "orderId": "ORD-123"
    }
  ],
  "driverName": "Rajesh",
  "vehicleType": "bike"
}
```

**Response:** `RunRecord` with optimized stop order and ETAs.

### GET /api/v1/runs/:runId

Fetch run by ID. No auth required (for embed).

### PATCH /api/v1/runs/:runId/stops/:stopId

Update stop status. Requires HMAC signature.

```json
{ "status": "arrived" | "delivered" | "skipped" }
```

### DELETE /api/v1/runs/:runId

Archive run (sets status to `archived`, TTL 48h). Requires HMAC signature.

### GET /api/v1/geocode?q=address

Geocode proxy with KV caching.

## HMAC Signing

```typescript
const secret = process.env.HMAC_SECRET;
const body = JSON.stringify(payload);
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac('sha256', secret).update(body).digest('hex');

fetch('/api/v1/runs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-signature': signature,
    'x-timestamp': timestamp,
  },
  body,
});
```

## Embedding Tracking Widget

```html
<iframe
  src="https://your-domain.vercel.app/embed/{runId}"
  width="400"
  height="520"
  frameborder="0"
  style="border-radius: 12px; border: none;"
/>
```

The embed polls every 15 seconds for live status updates.

## Pages

| Route | Description |
|---|---|
| `/planner` | Route planning UI with map |
| `/run/:runId` | Full-screen driver view |
| `/embed/:runId` | Compact embed widget |

## Deployment to Vercel

```bash
vercel --prod
```

Set all environment variables in Vercel dashboard → Settings → Environment Variables.

Create a KV database: Vercel Dashboard → Storage → Create → KV.

## Production Notes

- Replace `NEXT_PUBLIC_HMAC_SECRET` with a server-side signing endpoint
- OSRM public API is rate-limited; consider self-hosting for high volume
- Nominatim is rate-limited to 1 req/s; cached results avoid re-geocoding
- KV free tier: 30MB storage, 3000 req/day — sufficient for small fleets
- ElevenLabs free tier: 10,000 characters/month
