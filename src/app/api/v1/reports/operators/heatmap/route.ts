import { db } from '@/lib/db'
import { getCurrentOperator, handleError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/reports/operators/heatmap?days=14
 *
 * Returns a 7×24 heatmap matrix (day-of-week × hour-of-day) of operator
 * activity based on audit_log timestamps. Helps coordinators spot coverage
 * gaps and schedule shifts.
 *
 * Also returns per-operator breakdowns so the UI can filter.
 */
export async function GET(req: Request) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const url = new URL(req.url)
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? 14)))
    const since = new Date(Date.now() - days * 24 * 3600_000)

    const logs = await db.auditLog.findMany({
      where: {
        AND: [
          { timestamp: { gte: since } },
          { actor_type: 'operator' },
        ],
      },
      select: {
        actor_id: true,
        action: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'asc' },
    })

    // Build 7×24 matrix (day-of-week 0=Sun..6=Sat, hour 0..23)
    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    // Per-operator matrices
    const byOperator: Record<string, number[][]> = {}

    for (const log of logs) {
      const d = log.timestamp
      const dow = d.getDay()
      const hour = d.getUTCHours() // use UTC for consistency
      matrix[dow][hour]++
      if (log.actor_id) {
        if (!byOperator[log.actor_id]) {
          byOperator[log.actor_id] = Array.from({ length: 7 }, () => Array(24).fill(0))
        }
        byOperator[log.actor_id][dow][hour]++
      }
    }

    // Find peak for color scaling
    let max = 0
    for (const row of matrix) {
      for (const v of row) {
        if (v > max) max = v
      }
    }

    // Per-operator summary (for the filter dropdown)
    const operatorIds = Object.keys(byOperator)
    const operators = await db.operator.findMany({
      where: { id: { in: operatorIds } },
      select: { id: true, display_name: true, role: true },
    })
    const operatorMap = new Map(operators.map((o) => [o.id, o]))
    const operatorSummaries = operatorIds
      .map((id) => {
        const op = operatorMap.get(id)
        if (!op) return null
        let total = 0
        for (const row of byOperator[id]) for (const v of row) total += v
        return { id, display_name: op.display_name, role: op.role, total_actions: total }
      })
      .filter((x): x is { id: string; display_name: string; role: string; total_actions: number } => x !== null)
      .sort((a, b) => b.total_actions - a.total_actions)

    return Response.json({
      days,
      since: since.toISOString(),
      generated_at: new Date().toISOString(),
      matrix, // [dayOfWeek][hour] = count
      max,
      total_actions: logs.length,
      operators: operatorSummaries,
      by_operator: byOperator, // { [operatorId]: matrix }
      day_labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      note: 'Heatmap shows audit-log activity by day-of-week × hour-of-day (UTC). Use it to spot coverage gaps and schedule shifts.',
    })
  } catch (err) {
    return handleError(err)
  }
}
