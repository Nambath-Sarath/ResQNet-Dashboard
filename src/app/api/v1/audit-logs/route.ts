import { db } from '@/lib/db'
import { getCurrentOperator, handleError, requireRole } from '@/lib/auth'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/audit-logs — restricted audit history.
 * Spec §6.9 + §13: "Restrict read access; audit sensitive reads/exports."
 */
export async function GET(req: Request) {
  try {
    const op = await requireRole('ADMINISTRATOR', 'DISPATCHER')
    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    const entity_type = url.searchParams.get('entity_type')
    const actor_id = url.searchParams.get('actor_id')
    const since = url.searchParams.get('since')
    const limit = Math.min(500, Number(url.searchParams.get('limit') ?? 200))

    const filters: Prisma.AuditLogWhereInput[] = []
    if (action) filters.push({ action: { contains: action } })
    if (entity_type) filters.push({ entity_type })
    if (actor_id) filters.push({ actor_id })
    if (since) {
      const d = new Date(since)
      if (!Number.isNaN(d.getTime())) filters.push({ timestamp: { gte: d } })
    }
    const where: Prisma.AuditLogWhereInput = filters.length ? { AND: filters } : {}

    const logs = await db.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    })

    return Response.json({
      logs: logs.map((l) => ({
        id: l.id,
        actor_type: l.actor_type,
        actor_id: l.actor_id,
        action: l.action,
        entity_type: l.entity_type,
        entity_id: l.entity_id,
        timestamp: l.timestamp,
        metadata: l.metadata,
      })),
      total: logs.length,
      viewer: { id: op.id, role: op.role },
    })
  } catch (err) {
    return handleError(err)
  }
}
