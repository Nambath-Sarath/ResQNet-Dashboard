import { db } from '@/lib/db'
import { getCurrentOperator, handleError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/map — aggregated map markers for the situation map.
 * Returns nodes (deployment + live), incidents, survivors, shelters.
 * Spec §6.2: "Node deployment references, current node positions from GPS,
 * survivor-provided locations, SOS/incidents, shelters."
 */
export async function GET(req: Request) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const url = new URL(req.url)
    const includeLayers = (url.searchParams.get('layers') ?? 'nodes,incidents,survivors,shelters').split(',')

    const heartbeatStaleAfter = new Date(Date.now() - 5 * 60_000)
    const result: Record<string, unknown> = {}

    if (includeLayers.includes('nodes')) {
      const nodes = await db.node.findMany({
        where: { deployment_lat: { not: null } },
        include: {
          heartbeats: { orderBy: { received_at: 'desc' }, take: 1 },
          locations: { orderBy: { captured_at: 'desc' }, take: 1 },
        },
      })
      result.nodes = nodes.map((n) => {
        const hb = n.heartbeats[0]
        const loc = n.locations[0]
        const isOnline = !!hb && hb.received_at > heartbeatStaleAfter
        return {
          id: n.id,
          display_name: n.display_name,
          lifecycle_state: n.lifecycle_state,
          deployment_lat: n.deployment_lat,
          deployment_lon: n.deployment_lon,
          deployment_accuracy_m: n.deployment_accuracy_m,
          live_lat: loc?.latitude ?? null,
          live_lon: loc?.longitude ?? null,
          live_accuracy_m: loc?.accuracy_m ?? null,
          live_captured_at: loc?.captured_at ?? null,
          online: isOnline,
          battery: hb?.battery ?? null,
          health_state: hb?.health_state ?? 'UNKNOWN',
          runtime_state: !hb ? 'offline' : isOnline ? (hb.health_state === 'FAULT' ? 'fault' : hb.health_state === 'DEGRADED' ? 'stale' : 'online') : 'offline',
        }
      })
    }

    if (includeLayers.includes('incidents')) {
      const incidents = await db.incident.findMany({
        where: {
          AND: [{ location_lat: { not: null } }, { status: { not: 'RESOLVED' } }],
        },
        select: {
          id: true,
          category: true,
          priority: true,
          status: true,
          description: true,
          people_affected: true,
          created_at: true,
          location_lat: true,
          location_lon: true,
          location_accuracy_m: true,
          location_source: true,
          location_captured_at: true,
        },
      })
      result.incidents = incidents
    }

    if (includeLayers.includes('survivors')) {
      const canSeeAll = ['ADMINISTRATOR', 'DISPATCHER', 'FIELD_COORDINATOR'].includes(op.role)
      const survivors = await db.survivor.findMany({
        where: {
          AND: [
            { location_lat: { not: null } },
            { status: canSeeAll ? { in: ['active', 'missing'] } : 'active' },
          ],
        },
        select: {
          id: true,
          temporary_ref: true,
          status: true,
          location_lat: true,
          location_lon: true,
          location_source: true,
          last_seen_at: true,
        },
      })
      result.survivors = survivors
    }

    if (includeLayers.includes('shelters')) {
      const shelters = await db.shelter.findMany({
        where: { status: { in: ['OPEN', 'FULL', 'EVACUATING'] } },
      })
      result.shelters = shelters
    }

    return Response.json({
      ...result,
      generated_at: new Date().toISOString(),
      freshness: { last_updated_at: new Date().toISOString(), stale: false },
    })
  } catch (err) {
    return handleError(err)
  }
}
