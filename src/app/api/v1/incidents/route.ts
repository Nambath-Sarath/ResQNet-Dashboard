import { db } from '@/lib/db'
import { getCurrentOperator, handleError, requireOperator, audit } from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

const STATUS_VALUES = ['NEW', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED', 'DUPLICATE'] as const
const PRIORITY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
const CATEGORY_VALUES = ['RESCUE', 'MEDICAL', 'FIRE', 'FLOOD', 'STRUCTURE', 'SUPPLY', 'COMMUNICATION', 'OTHER'] as const

/** GET /api/v1/incidents — filterable incident queue. */
export async function GET(req: Request) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const priority = url.searchParams.get('priority')
    const category = url.searchParams.get('category')
    const assigned_to_id = url.searchParams.get('assigned_to_id')
    const since = url.searchParams.get('since')
    const q = url.searchParams.get('q')?.toLowerCase()
    const limit = Math.min(200, Number(url.searchParams.get('limit') ?? 100))

    const where: Record<string, unknown> = { AND: [] }
    if (status && STATUS_VALUES.includes(status as never)) where.AND.push({ status })
    if (priority && PRIORITY_VALUES.includes(priority as never)) where.AND.push({ priority })
    if (category && CATEGORY_VALUES.includes(category as never)) where.AND.push({ category })
    if (assigned_to_id) where.AND.push({ assigned_to_id })
    if (since) {
      const d = new Date(since)
      if (!Number.isNaN(d.getTime())) where.AND.push({ created_at: { gte: d } })
    }
    if (where.AND.length === 0) delete where.AND

    const incidents = await db.incident.findMany({
      where,
      include: {
        assignee: { select: { id: true, display_name: true, role: true } },
        source_node: { select: { id: true, display_name: true } },
        events: { orderBy: { created_at: 'desc' }, take: 1 },
      },
      orderBy: [{ priority: 'desc' }, { created_at: 'asc' }],
      take: limit,
    })

    let filtered = incidents
    if (q) {
      filtered = incidents.filter(
        (i) => i.id.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
      )
    }

    return Response.json({
      incidents: filtered.map((i) => ({
        id: i.id,
        category: i.category,
        priority: i.priority,
        status: i.status,
        description: i.description,
        people_affected: i.people_affected,
        source_type: i.source_type,
        source_node_id: i.source_node_id,
        source_node: i.source_node,
        location_lat: i.location_lat,
        location_lon: i.location_lon,
        location_source: i.location_source,
        location_accuracy_m: i.location_accuracy_m,
        location_captured_at: i.location_captured_at,
        created_at: i.created_at,
        acknowledged_at: i.acknowledged_at,
        assigned_at: i.assigned_at,
        resolved_at: i.resolved_at,
        assigned_to: i.assignee,
        latest_event: i.events[0] ?? null,
      })),
      total: filtered.length,
      freshness: { last_updated_at: new Date().toISOString(), stale: false },
    })
  } catch (err) {
    return handleError(err)
  }
}

/** POST /api/v1/incidents — create an incident from an authorized source. */
export async function POST(req: Request) {
  try {
    const op = await requireOperator()
    const body = await req.json().catch(() => null)

    const category = String(body?.category ?? '').toUpperCase()
    const description = String(body?.description ?? '').trim()
    const people_affected = body?.people_affected != null ? Number(body.people_affected) : null
    const priority = String(body?.priority ?? 'MEDIUM').toUpperCase()
    const source_type = String(body?.source_type ?? 'operator')
    const source_node_id = body?.source_node_id ? String(body.source_node_id) : null
    const client_submission_id = body?.client_submission_id ? String(body.client_submission_id) : null

    if (!description) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'description is required.' } }, { status: 400 })
    }
    if (!CATEGORY_VALUES.includes(category as never)) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid category. Allowed: ${CATEGORY_VALUES.join(', ')}` } }, { status: 400 })
    }
    if (!PRIORITY_VALUES.includes(priority as never)) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid priority. Allowed: ${PRIORITY_VALUES.join(', ')}` } }, { status: 400 })
    }

    // idempotency: if (source_node_id, client_submission_id) already exists, return existing
    if (source_node_id && client_submission_id) {
      const existing = await db.incident.findFirst({
        where: { source_node_id, client_submission_id },
      })
      if (existing) {
        return Response.json(
          {
            incident_id: existing.id,
            status: existing.status,
            created_at: existing.created_at,
            accepted_by_gateway: true,
            duplicate: true,
          },
          { status: 200 },
        )
      }
    }

    // generate SOS-NNNN id
    const count = await db.incident.count()
    const incident_id = `SOS-${1000 + count + 1}`

    const location = body?.location ?? null
    const incident = await db.incident.create({
      data: {
        id: incident_id,
        client_submission_id,
        category: category as never,
        priority: priority as never,
        status: 'NEW',
        description,
        people_affected: people_affected && !Number.isNaN(people_affected) ? people_affected : null,
        source_type,
        source_node_id,
        location_lat: location?.latitude != null ? Number(location.latitude) : null,
        location_lon: location?.longitude != null ? Number(location.longitude) : null,
        location_source: location?.source ?? null,
        location_accuracy_m: location?.accuracy_m != null ? Number(location.accuracy_m) : null,
        location_captured_at: location?.captured_at ? new Date(location.captured_at) : null,
        events: {
          create: {
            event_type: 'created',
            actor_type: 'operator',
            actor_id: op.id,
            new_value: 'NEW',
            note: `Created by ${op.display_name}`,
          },
        },
      },
    })

    await audit({
      actor_id: op.id,
      action: 'incident.create',
      entity_type: 'incident',
      entity_id: incident.id,
      metadata: { category, priority, source_type },
    })

    // Publish realtime event AFTER the DB transaction succeeded (spec §8.3)
    await publishEvent({
      event_type: 'incident.created',
      entity_id: incident.id,
      data: {
        status: incident.status,
        category: incident.category,
        priority: incident.priority,
        source_node_id: incident.source_node_id,
        source_type: incident.source_type,
        created_at: incident.created_at.toISOString(),
      },
    })

    return Response.json(
      {
        incident_id: incident.id,
        status: incident.status,
        created_at: incident.created_at,
        accepted_by_gateway: true,
      },
      { status: 201 },
    )
  } catch (err) {
    return handleError(err)
  }
}
