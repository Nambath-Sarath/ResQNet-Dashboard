import { db } from '@/lib/db'
import { getCurrentOperator, handleError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/system/clock — clock-drift indicators.
 * Spec §11.4: "Offline devices may have incorrect clocks. Keep both device-reported
 * and gateway-received timestamps where useful. Display uncertainty if clock
 * synchronization has not occurred."
 *
 * Compares node_reported_at vs received_at for recent heartbeats to detect drift.
 */
export async function GET() {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }

    const now = new Date()
    const gatewayTime = now.toISOString()

    // Gather latest heartbeats per node
    const nodes = await db.node.findMany({
      include: {
        heartbeats: { orderBy: { received_at: 'desc' }, take: 1 },
      },
    })

    const clockStates = nodes.map((n) => {
      const hb = n.heartbeats[0]
      if (!hb) {
        return {
          node_id: n.id,
          display_name: n.display_name,
          has_heartbeat: false,
          drift_ms: null,
          drift_label: 'No heartbeat',
          uncertainty: 'unknown',
        }
      }
      const drift = hb.node_reported_at.getTime() - hb.received_at.getTime()
      const absDrift = Math.abs(drift)
      let label: string
      let uncertainty: 'ok' | 'warning' | 'critical' | 'unknown'
      if (absDrift < 5_000) {
        label = 'Synchronized'
        uncertainty = 'ok'
      } else if (absDrift < 60_000) {
        label = `${(absDrift / 1000).toFixed(0)}s drift`
        uncertainty = 'warning'
      } else if (absDrift < 3600_000) {
        label = `${(absDrift / 60_000).toFixed(0)}m drift`
        uncertainty = 'critical'
      } else {
        label = `${(absDrift / 3_600_000).toFixed(1)}h drift`
        uncertainty = 'critical'
      }
      return {
        node_id: n.id,
        display_name: n.display_name,
        has_heartbeat: true,
        node_reported_at: hb.node_reported_at.toISOString(),
        received_at: hb.received_at.toISOString(),
        drift_ms: drift,
        drift_label: label,
        uncertainty,
      }
    })

    const uncertainCount = clockStates.filter((c) => c.uncertainty === 'warning' || c.uncertainty === 'critical').length
    const okCount = clockStates.filter((c) => c.uncertainty === 'ok').length

    return Response.json({
      gateway_time: gatewayTime,
      gateway_clock_source: 'system',
      nodes: clockStates,
      summary: {
        total: clockStates.length,
        synchronized: okCount,
        uncertain: uncertainCount,
      },
      note: 'Clock drift is computed from the difference between the node-reported timestamp and the gateway-received timestamp. Large drift indicates the node clock has not been synchronized (spec §11.4).',
    })
  } catch (err) {
    return handleError(err)
  }
}
