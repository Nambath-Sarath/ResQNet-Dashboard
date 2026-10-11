import { db } from '@/lib/db'
import { getCurrentOperator, handleError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/reports/incidents — incident metrics + export inputs.
 * Spec §6.9: "Incident totals by category, status, priority and time range.
 * Acknowledgement/assignment/resolution durations."
 * Spec §6.9: "Allow CSV/JSON export for the first release."
 */
export async function GET(req: Request) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const url = new URL(req.url)
    const since = url.searchParams.get('since')
    const format = url.searchParams.get('format') ?? 'json'

    const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 3600_000)
    const incidents = await db.incident.findMany({
      where: { created_at: { gte: sinceDate } },
      include: {
        assignee: { select: { display_name: true } },
        source_node: { select: { id: true, display_name: true } },
      },
      orderBy: { created_at: 'asc' },
    })

    // Aggregate metrics
    const byCategory: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    const byPriority: Record<string, number> = {}
    let ackDurations: number[] = []
    let assignDurations: number[] = []
    let resolveDurations: number[] = []

    for (const inc of incidents) {
      byCategory[inc.category] = (byCategory[inc.category] ?? 0) + 1
      byStatus[inc.status] = (byStatus[inc.status] ?? 0) + 1
      byPriority[inc.priority] = (byPriority[inc.priority] ?? 0) + 1
      if (inc.acknowledged_at) {
        ackDurations.push(inc.acknowledged_at.getTime() - inc.created_at.getTime())
      }
      if (inc.assigned_at) {
        assignDurations.push(inc.assigned_at.getTime() - inc.created_at.getTime())
      }
      if (inc.resolved_at) {
        resolveDurations.push(inc.resolved_at.getTime() - inc.created_at.getTime())
      }
    }

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)

    const summary = {
      total: incidents.length,
      by_category: byCategory,
      by_status: byStatus,
      by_priority: byPriority,
      avg_ack_seconds: avg(ackDurations) ? Math.round(avg(ackDurations)! / 1000) : null,
      avg_assign_seconds: avg(assignDurations) ? Math.round(avg(assignDurations)! / 1000) : null,
      avg_resolve_seconds: avg(resolveDurations) ? Math.round(avg(resolveDurations)! / 1000) : null,
      max_resolve_seconds: resolveDurations.length ? Math.round(Math.max(...resolveDurations) / 1000) : null,
      min_resolve_seconds: resolveDurations.length ? Math.round(Math.min(...resolveDurations) / 1000) : null,
      since: sinceDate.toISOString(),
      generated_at: new Date().toISOString(),
    }

    if (format === 'csv') {
      // CSV export of all incidents in the range
      const header = 'incident_id,created_at,category,priority,status,people_affected,acknowledged_at,assigned_at,resolved_at,assignee,source_node,description'
      const rows = incidents.map((inc) => {
        const esc = (s: string | number | null | undefined) => {
          const v = String(s ?? '').replace(/"/g, '""')
          return `"${v}"`
        }
        return [
          inc.id,
          inc.created_at.toISOString(),
          inc.category,
          inc.priority,
          inc.status,
          inc.people_affected ?? '',
          inc.acknowledged_at?.toISOString() ?? '',
          inc.assigned_at?.toISOString() ?? '',
          inc.resolved_at?.toISOString() ?? '',
          inc.assignee?.display_name ?? '',
          inc.source_node?.id ?? '',
          inc.description,
        ].map(esc).join(',')
      })
      const csv = [header, ...rows].join('\n')
      return new Response(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="resqnet-incidents-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    return Response.json({
      summary,
      incidents: incidents.map((inc) => ({
        id: inc.id,
        created_at: inc.created_at,
        category: inc.category,
        priority: inc.priority,
        status: inc.status,
        people_affected: inc.people_affected,
        acknowledged_at: inc.acknowledged_at,
        assigned_at: inc.assigned_at,
        resolved_at: inc.resolved_at,
        assignee: inc.assignee?.display_name ?? null,
        source_node: inc.source_node?.id ?? null,
        description: inc.description,
        ack_seconds: inc.acknowledged_at ? Math.round((inc.acknowledged_at.getTime() - inc.created_at.getTime()) / 1000) : null,
        resolve_seconds: inc.resolved_at ? Math.round((inc.resolved_at.getTime() - inc.created_at.getTime()) / 1000) : null,
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}
