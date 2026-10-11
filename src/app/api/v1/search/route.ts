import { db } from '@/lib/db'
import { getCurrentOperator, handleError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/search?q=...
 * Global search across incidents, nodes, survivors, shelters, messages.
 * Returns up to 5 results per entity type (25 total).
 * Respects role-based access (e.g. survivor contact fields hidden for viewers).
 */
export async function GET(req: Request) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const url = new URL(req.url)
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    if (!q || q.length < 2) {
      return Response.json({ results: [], total: 0, q })
    }
    const canSeeContact = ['ADMINISTRATOR', 'DISPATCHER', 'FIELD_COORDINATOR'].includes(op.role)

    const [incidents, nodes, survivors, shelters, messages] = await Promise.all([
      db.incident.findMany({
        where: {
          OR: [
            { id: { contains: q } },
            { description: { contains: q } },
          ],
        },
        take: 5,
        orderBy: { created_at: 'desc' },
        select: { id: true, category: true, priority: true, status: true, description: true, created_at: true },
      }),
      db.node.findMany({
        where: {
          OR: [
            { id: { contains: q } },
            { display_name: { contains: q } },
          ],
        },
        take: 5,
        orderBy: { id: 'asc' },
        select: { id: true, display_name: true, lifecycle_state: true },
      }),
      db.survivor.findMany({
        where: {
          OR: [
            { temporary_ref: { contains: q } },
            { display_name: { contains: q } },
          ],
        },
        take: 5,
        orderBy: { last_seen_at: 'desc' },
        select: { id: true, temporary_ref: true, display_name: true, status: true, last_seen_at: true },
      }),
      db.shelter.findMany({
        where: {
          OR: [
            { name: { contains: q } },
          ],
        },
        take: 5,
        orderBy: { name: 'asc' },
        select: { id: true, name: true, status: true, capacity: true, occupancy_estimate: true },
      }),
      db.message.findMany({
        where: {
          OR: [
            { body: { contains: q } },
            { destination: { contains: q } },
          ],
        },
        take: 5,
        orderBy: { created_at: 'desc' },
        select: { id: true, destination: true, body: true, status: true, created_at: true },
      }),
    ])

    const results = [
      ...incidents.map((i) => ({
        type: 'incident' as const,
        id: i.id,
        title: i.id,
        subtitle: i.description.slice(0, 80),
        badge: i.priority,
        meta: i.category,
        created_at: i.created_at,
        view: { name: 'incident', incidentId: i.id },
      })),
      ...nodes.map((n) => ({
        type: 'node' as const,
        id: n.id,
        title: n.display_name,
        subtitle: n.id,
        badge: n.lifecycle_state,
        meta: 'node',
        view: { name: 'node', nodeId: n.id },
      })),
      ...survivors.map((s) => ({
        type: 'survivor' as const,
        id: s.id,
        title: s.temporary_ref,
        subtitle: canSeeContact && s.display_name ? s.display_name : '—',
        badge: s.status,
        meta: 'survivor',
        created_at: s.last_seen_at,
        view: { name: 'survivors' },
      })),
      ...shelters.map((sh) => ({
        type: 'shelter' as const,
        id: sh.id,
        title: sh.name,
        subtitle: `${sh.occupancy_estimate}/${sh.capacity} occupied`,
        badge: sh.status,
        meta: 'shelter',
        view: { name: 'shelters' },
      })),
      ...messages.map((m) => ({
        type: 'message' as const,
        id: m.id,
        title: `→ ${m.destination}`,
        subtitle: m.body.slice(0, 80),
        badge: m.status,
        meta: 'message',
        created_at: m.created_at,
        view: { name: 'messages' },
      })),
    ]

    return Response.json({
      results,
      total: results.length,
      q,
      counts: {
        incident: incidents.length,
        node: nodes.length,
        survivor: survivors.length,
        shelter: shelters.length,
        message: messages.length,
      },
    })
  } catch (err) {
    return handleError(err)
  }
}
