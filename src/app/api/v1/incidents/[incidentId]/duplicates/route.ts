import { db } from '@/lib/db'
import { getCurrentOperator, handleError, NotFoundError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ incidentId: string }> }

/**
 * GET /api/v1/incidents/{incident_id}/duplicates
 *
 * Finds possible duplicate incidents for the given incident based on:
 *   - Same category
 *   - Created within 60 minutes of each other
 *   - Within 500m of each other (Haversine) — only if both have location
 *   - OR same source_node_id + similar description
 *
 * Returns a list of candidate duplicates with a confidence score.
 * Spec §6.3: "Related/possible duplicate incident IDs."
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const { incidentId } = await params
    const incident = await db.incident.findUnique({ where: { id: incidentId } })
    if (!incident) throw new NotFoundError()

    // Fetch candidate incidents: same category, created within ±60 min
    const windowMs = 60 * 60_000
    const since = new Date(incident.created_at.getTime() - windowMs)
    const until = new Date(incident.created_at.getTime() + windowMs)

    const candidates = await db.incident.findMany({
      where: {
        AND: [
          { id: { not: incident.id } },
          { category: incident.category },
          { created_at: { gte: since } },
          { created_at: { lte: until } },
        ],
      },
      include: {
        assignee: { select: { display_name: true } },
        source_node: { select: { id: true, display_name: true } },
      },
      take: 50,
    })

    const duplicates = candidates
      .map((c) => {
        let score = 0
        const reasons: string[] = []

        // Same category is required (already filtered) → base score
        score += 30
        reasons.push('same category')

        // Time proximity (closer = higher score)
        const timeDiffMin = Math.abs(c.created_at.getTime() - incident.created_at.getTime()) / 60_000
        if (timeDiffMin < 5) {
          score += 40
          reasons.push(`created ${timeDiffMin.toFixed(0)}m apart`)
        } else if (timeDiffMin < 15) {
          score += 25
          reasons.push(`created ${timeDiffMin.toFixed(0)}m apart`)
        } else if (timeDiffMin < 30) {
          score += 15
          reasons.push(`created ${timeDiffMin.toFixed(0)}m apart`)
        } else {
          score += 5
          reasons.push(`created ${timeDiffMin.toFixed(0)}m apart`)
        }

        // Location proximity (if both have coordinates)
        if (incident.location_lat != null && incident.location_lon != null &&
            c.location_lat != null && c.location_lon != null) {
          const dist = haversine(
            incident.location_lat, incident.location_lon,
            c.location_lat, c.location_lon,
          )
          if (dist < 0.1) { // <100m
            score += 40
            reasons.push(`${Math.round(dist * 1000)}m apart`)
          } else if (dist < 0.5) { // <500m
            score += 25
            reasons.push(`${Math.round(dist * 1000)}m apart`)
          } else if (dist < 1.0) { // <1km
            score += 10
            reasons.push(`${Math.round(dist * 1000)}m apart`)
          }
        }

        // Same source node
        if (incident.source_node_id && c.source_node_id === incident.source_node_id) {
          score += 15
          reasons.push('same source node')
        }

        // Description similarity (simple word-overlap check)
        const words1 = new Set(incident.description.toLowerCase().split(/\W+/).filter((w) => w.length > 3))
        const words2 = new Set(c.description.toLowerCase().split(/\W+/).filter((w) => w.length > 3))
        const overlap = [...words1].filter((w) => words2.has(w)).length
        if (overlap >= 3) {
          score += 20
          reasons.push(`${overlap} shared keywords`)
        } else if (overlap >= 1) {
          score += 5
          reasons.push(`${overlap} shared keyword${overlap > 1 ? 's' : ''}`)
        }

        // Same people_affected
        if (incident.people_affected != null && c.people_affected === incident.people_affected && incident.people_affected > 0) {
          score += 10
          reasons.push(`same people affected (${incident.people_affected})`)
        }

        return {
          incident_id: c.id,
          category: c.category,
          priority: c.priority,
          status: c.status,
          description: c.description,
          created_at: c.created_at.toISOString(),
          time_diff_minutes: Math.round(timeDiffMin),
          location_lat: c.location_lat,
          location_lon: c.location_lon,
          distance_km: (incident.location_lat != null && c.location_lat != null)
            ? haversine(incident.location_lat!, incident.location_lon!, c.location_lat!, c.location_lon!)
            : null,
          source_node_id: c.source_node_id,
          assignee: c.assignee?.display_name ?? null,
          confidence: Math.min(100, score),
          reasons,
        }
      })
      .filter((d) => d.confidence >= 35) // only show plausible duplicates
      .sort((a, b) => b.confidence - a.confidence)

    return Response.json({
      incident_id: incidentId,
      duplicates,
      total: duplicates.length,
      note: 'Duplicate detection uses category + time + location + source node + keyword overlap. Confidence is a heuristic score (0-100), not a definitive match. Operators must confirm before merging.',
    })
  } catch (err) {
    return handleError(err)
  }
}

/** Haversine distance in km. */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
