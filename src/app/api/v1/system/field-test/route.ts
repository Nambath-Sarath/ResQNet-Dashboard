import { db } from '@/lib/db'
import { getCurrentOperator, handleError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Spec §16.4 field/network tests + §17 acceptance criteria, encoded as a checklist.
const CHECKLIST = [
  // Spec §16.3 integration tests
  { id: 'int-1', section: 'Integration', text: 'A simulated survivor submission reaches the API and is persisted.', severity: 'critical' },
  { id: 'int-2', section: 'Integration', text: 'The dashboard sees the incident via WebSocket or its fallback and can acknowledge it.', severity: 'critical' },
  { id: 'int-3', section: 'Integration', text: 'The dashboard correctly handles an API restart.', severity: 'high' },
  { id: 'int-4', section: 'Integration', text: 'A node reports a GPS-only descriptor and only GPS features appear.', severity: 'high' },
  { id: 'int-5', section: 'Integration', text: 'A node reports GPS plus camera and both supported feature sets appear.', severity: 'high' },
  { id: 'int-6', section: 'Integration', text: 'A node with no optional modules still displays its locked deployment reference.', severity: 'medium' },
  { id: 'int-7', section: 'Integration', text: 'An invalid or unsupported descriptor is rejected or safely marked incompatible.', severity: 'high' },
  { id: 'int-8', section: 'Integration', text: 'A stale GPS value is displayed as stale, not current.', severity: 'high' },
  { id: 'int-9', section: 'Integration', text: 'Node movement alerts require sufficient valid evidence and create an audit/event record.', severity: 'high' },
  { id: 'int-10', section: 'Integration', text: 'A node loses its gateway link, queues a test message, reconnects, forwards it, and duplicate forwarding does not create duplicate incidents.', severity: 'critical' },
  { id: 'int-11', section: 'Integration', text: 'The Pi reboots and the database records persist.', severity: 'critical' },
  { id: 'int-12', section: 'Integration', text: 'A backup can be restored successfully.', severity: 'critical' },
  // Spec §16.4 field/network tests
  { id: 'fld-1', section: 'Field', text: 'Test the chosen radio topology in realistic distances and obstructions.', severity: 'critical' },
  { id: 'fld-2', section: 'Field', text: 'Measure delivery latency, packet loss, retries, queue growth, and battery consumption.', severity: 'high' },
  { id: 'fld-3', section: 'Field', text: 'Test when some nodes are offline but others remain reachable.', severity: 'high' },
  { id: 'fld-4', section: 'Field', text: 'Test browser geolocation behavior on the actual Android/iOS device and portal origin.', severity: 'high' },
  { id: 'fld-5', section: 'Field', text: 'Test offline map coverage, tile storage, and UI behavior outside the downloaded area.', severity: 'medium' },
]

/**
 * GET /api/v1/system/field-test — the field-test checklist (spec §16.4).
 * Returns the static checklist + any recorded pass/fail statuses from system_events.
 */
export async function GET() {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }

    // Load recorded statuses from system_events
    const recordedEvents = await db.systemEvent.findMany({
      where: { event_type: 'field_test.result' },
      orderBy: { occurred_at: 'desc' },
    })
    const recorded = new Map<string, { status: 'pass' | 'fail' | 'skip'; note: string; at: string }>()
    for (const e of recordedEvents) {
      try {
        const payload = JSON.parse(e.payload ?? '{}')
        if (payload.checklist_id) {
          recorded.set(payload.checklist_id, {
            status: payload.status,
            note: payload.note ?? '',
            at: e.occurred_at.toISOString(),
          })
        }
      } catch {
        // ignore parse errors
      }
    }

    const items = CHECKLIST.map((c) => {
      const r = recorded.get(c.id)
      return {
        ...c,
        status: r?.status ?? 'pending',
        note: r?.note ?? '',
        recorded_at: r?.at ?? null,
      }
    })

    const summary = {
      total: items.length,
      passed: items.filter((i) => i.status === 'pass').length,
      failed: items.filter((i) => i.status === 'fail').length,
      skipped: items.filter((i) => i.status === 'skip').length,
      pending: items.filter((i) => i.status === 'pending').length,
    }

    return Response.json({
      items,
      summary,
      generated_at: new Date().toISOString(),
      spec_ref: '§16.4 + §16.3',
      note: 'Do not market the system as rescue-ready based only on UI or simulator tests. Real field deployment requires supervised hardware testing and an operational safety plan.',
    })
  } catch (err) {
    return handleError(err)
  }
}
