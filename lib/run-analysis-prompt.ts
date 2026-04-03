import type { RunRecord } from '@/types';

/**
 * Self-contained prompt for pasting into any external chat UI (no API keys).
 * Each third-party service has its own rules and limits — we only format your run data.
 */
export function buildRunAnalysisPrompt(run: RunRecord): string {
  const lines: string[] = [
    'You are a logistics analyst helping a delivery driver. Using ONLY the data below, produce a concise, practical report.',
    '',
    '## Tasks',
    '1. Summarize the optimized stop order and why an order-first workflow matters.',
    '2. Comment on total distance and duration (rough realism for urban delivery, given vehicle type if stated).',
    '3. List 3–5 operational tips for this specific sequence (timing, breaks, fuel, difficult legs).',
    '4. Flag any risks (long legs, tight ETAs, many stops in a row) and one alternative heuristic if a stop fails.',
    '5. Keep the tone actionable; avoid inventing addresses or stops not listed.',
    '',
    '## Run data',
    `- **Run ID:** ${run.runId}`,
    `- **Created:** ${run.createdAt}`,
    `- **Status:** ${run.status}`,
    `- **Vehicle:** ${run.vehicleType ?? 'not specified'}`,
    `- **Driver:** ${run.driverName ?? 'not specified'}`,
    `- **Totals:** ${run.totalDistanceKm} km road distance (OSRM-based), ~${run.totalDurationMin} min including short handoff buffer between stops.`,
    '',
    `### Depot`,
    `- ${run.depot.label}${run.depot.address ? ` — ${run.depot.address}` : ''}`,
    `- Coordinates: ${run.depot.position.lat.toFixed(6)}, ${run.depot.position.lng.toFixed(6)}`,
    '',
    '### Stops (optimized visit order)',
  ];

  run.stops.forEach((s, i) => {
    const leg =
      s.distanceFromPrevKm != null && s.durationFromPrevMin != null
        ? ` | Leg from previous: ~${s.distanceFromPrevKm} km, ~${s.durationFromPrevMin} min drive`
        : '';
    const eta = s.eta ? ` | ETA snapshot: ${s.eta}` : '';
    lines.push(
      `${i + 1}. **${s.label}** (id: ${s.id}) — ${s.status}${s.orderId ? ` | Order: ${s.orderId}` : ''}${s.address ? `\n   Address: ${s.address}` : ''}\n   Coords: ${s.position.lat.toFixed(6)}, ${s.position.lng.toFixed(6)}${leg}${eta}${s.notes ? `\n   Notes: ${s.notes}` : ''}`
    );
  });

  if (run.directionsUrl) {
    lines.push('', '### External directions link (same stop order)', run.directionsUrl);
  }

  lines.push(
    '',
    '---',
    'This route was computed with open data (OSRM driving graph + Nominatim geocoding). Actual traffic may differ.'
  );

  return lines.join('\n');
}
