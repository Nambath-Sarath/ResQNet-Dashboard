import { db } from '@/lib/db'
import { getCurrentOperator, handleError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/survivors — filterable survivor registry.
 * Spec §6.4: "Use access controls and data minimization. Avoid showing
 * sensitive contact data to roles that do not need it."
 */
export async function GET(req: Request) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    // Restrict contact fields to roles that need them
    const canSeeContact = ['ADMINISTRATOR', 'DISPATCHER', 'FIELD_COORDINATOR'].includes(op.role)

    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const q = url.searchParams.get('q')?.toLowerCase()
    const limit = Math.min(200, Number(url.searchParams.get('limit') ?? 100))

    const where: Record<string, unknown> = { AND: [] }
    if (status) where.AND.push({ status })
    if (where.AND.length === 0) delete where.AND

    const survivors = await db.survivor.findMany({
      where,
      orderBy: { last_seen_at: 'desc' },
      take: limit,
    })

    let filtered = survivors
    if (q) {
      filtered = survivors.filter(
        (s) =>
          s.temporary_ref.toLowerCase().includes(q) ||
          (s.display_name ?? '').toLowerCase().includes(q),
      )
    }

    return Response.json({
      survivors: filtered.map((s) => ({
        id: s.id,
        temporary_ref: s.temporary_ref,
        display_name: canSeeContact ? s.display_name : null,
        contact: canSeeContact ? s.contact : null,
        first_seen_at: s.first_seen_at,
        last_seen_at: s.last_seen_at,
        status: s.status,
        location_lat: s.location_lat,
        location_lon: s.location_lon,
        location_source: s.location_source,
        notes: s.notes,
      })),
      total: filtered.length,
      can_see_contact: canSeeContact,
      freshness: { last_updated_at: new Date().toISOString(), stale: false },
    })
  } catch (err) {
    return handleError(err)
  }
}
