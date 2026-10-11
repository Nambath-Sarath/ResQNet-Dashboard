// Server-side helper to publish realtime events to the socket.io mini-service.
// Called by API routes AFTER a successful DB transaction (spec §8.3).
// Fire-and-forget: failures do not affect the API response.

const REALTIME_PUBLISH_URL = 'http://localhost:3004/__publish'

export type RealtimeEvent = {
  event_type: string
  entity_id?: string | null
  data?: Record<string, unknown>
  occurred_at?: string
}

/**
 * Publish a realtime event to all connected dashboards.
 * Safe to call from Next.js Route Handlers (server-side only).
 * Failures are logged but do not throw.
 */
export async function publishEvent(event: RealtimeEvent): Promise<void> {
  try {
    await fetch(REALTIME_PUBLISH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    })
  } catch (e) {
    // Realtime service may be down; the REST fallback + polling still works.
    console.warn('[realtime] publish failed (event_type=%s):', event.event_type, e)
  }
}
