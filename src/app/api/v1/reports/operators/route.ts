import { db } from '@/lib/db'
import { getCurrentOperator, handleError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/reports/operators
 *
 * Per-operator activity metrics for load balancing.
 * Returns: assigned/acknowledged/resolved counts, avg response times, active assignments.
 *
 * Spec §6.9: "Operator audit trail" + general operational reporting.
 */
export async function GET(req: Request) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const url = new URL(req.url)
    const hours = Math.min(168, Math.max(1, Number(url.searchParams.get('hours') ?? 168)))
    const since = new Date(Date.now() - hours * 3600_000)

    const operators = await db.operator.findMany({
      where: { active: true },
      select: {
        id: true,
        username: true,
        display_name: true,
        role: true,
        incidents_assigned: {
          where: { assigned_at: { gte: since } },
          select: {
            id: true,
            status: true,
            priority: true,
            category: true,
            created_at: true,
            acknowledged_at: true,
            assigned_at: true,
            resolved_at: true,
          },
        },
        audit_entries: {
          where: { timestamp: { gte: since } },
          select: { action: true, timestamp: true },
        },
      },
    })

    const summary = operators.map((o) => {
      const assigned = o.incidents_assigned
      const active = assigned.filter((i) => !['RESOLVED', 'CANCELLED', 'DUPLICATE'].includes(i.status))
      const resolved = assigned.filter((i) => i.status === 'RESOLVED')
      const acknowledged = assigned.filter((i) => i.acknowledged_at)

      // Response times
      const ackTimes = acknowledged
        .filter((i) => i.acknowledged_at)
        .map((i) => (i.acknowledged_at!.getTime() - i.created_at.getTime()) / 1000)
      const resolveTimes = resolved
        .filter((i) => i.resolved_at)
        .map((i) => (i.resolved_at!.getTime() - i.created_at.getTime()) / 1000)

      const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

      // Audit action counts
      const actionCounts: Record<string, number> = {}
      for (const a of o.audit_entries) {
        const key = a.action.split('.')[0] // e.g. "incident" from "incident.acknowledge"
        actionCounts[key] = (actionCounts[key] ?? 0) + 1
      }

      return {
        id: o.id,
        username: o.username,
        display_name: o.display_name,
        role: o.role,
        stats: {
          assigned_total: assigned.length,
          active_count: active.length,
          resolved_count: resolved.length,
          acknowledged_count: acknowledged.length,
          avg_ack_seconds: avg(ackTimes) ? Math.round(avg(ackTimes)!) : null,
          avg_resolve_seconds: avg(resolveTimes) ? Math.round(avg(resolveTimes)!) : null,
        },
        active_incidents: active.map((i) => ({
          id: i.id,
          status: i.status,
          priority: i.priority,
          category: i.category,
          created_at: i.created_at.toISOString(),
        })),
        action_counts: actionCounts,
        total_actions: o.audit_entries.length,
      }
    })

    // Sort: active count desc, then resolved count desc
    summary.sort((a, b) => {
      if (b.stats.active_count !== a.stats.active_count) return b.stats.active_count - a.stats.active_count
      return b.stats.resolved_count - a.stats.resolved_count
    })

    return Response.json({
      operators: summary,
      total_operators: summary.length,
      window_hours: hours,
      since: since.toISOString(),
      generated_at: new Date().toISOString(),
      totals: {
        active_incidents: summary.reduce((s, o) => s + o.stats.active_count, 0),
        resolved_incidents: summary.reduce((s, o) => s + o.stats.resolved_count, 0),
        total_actions: summary.reduce((s, o) => s + o.total_actions, 0),
      },
    })
  } catch (err) {
    return handleError(err)
  }
}
