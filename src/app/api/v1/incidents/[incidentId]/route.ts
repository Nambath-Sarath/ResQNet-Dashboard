import { db } from '@/lib/db'
import {
  getCurrentOperator,
  handleError,
  requireOperator,
  audit,
  NotFoundError,
  ValidationError,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ incidentId: string }> }

const STATUS_TRANSITIONS: Record<string, string[]> = {
  NEW: ['ACKNOWLEDGED', 'CANCELLED', 'DUPLICATE'],
  ACKNOWLEDGED: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['RESOLVED', 'CANCELLED'],
  RESOLVED: [],
  CANCELLED: [],
  DUPLICATE: [],
}

/** GET /api/v1/incidents/{incident_id} — full incident detail with history. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const { incidentId } = await params
    const incident = await db.incident.findUnique({
      where: { id: incidentId },
      include: {
        assignee: { select: { id: true, display_name: true, role: true } },
        source_node: { select: { id: true, display_name: true } },
        events: { orderBy: { created_at: 'asc' } },
        notes: { orderBy: { created_at: 'asc' }, include: { author: { select: { display_name: true, role: true } } } },
      },
    })
    if (!incident) throw new NotFoundError()
    return Response.json(incident)
  } catch (err) {
    return handleError(err)
  }
}

/** PATCH /api/v1/incidents/{incident_id} — update status/priority/assignment. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const op = await requireOperator()
    const { incidentId } = await params
    const body = await req.json().catch(() => ({}))

    const incident = await db.incident.findUnique({ where: { id: incidentId } })
    if (!incident) throw new NotFoundError()

    const updates: Record<string, unknown> = {}
    const events: { event_type: string; old_value: string | null; new_value: string; actor_type: string; actor_id: string; note?: string; created_at: Date }[] = []

    if (body.status) {
      const next = String(body.status)
      const allowed = STATUS_TRANSITIONS[incident.status] ?? []
      if (!allowed.includes(next)) {
        throw new ValidationError(
          `Cannot transition ${incident.status} → ${next}. Allowed: ${allowed.join(', ') || '(terminal)'}`,
        )
      }
      updates.status = next
      if (next === 'ACKNOWLEDGED' && !incident.acknowledged_at) {
        updates.acknowledged_at = new Date()
      }
      if (next === 'RESOLVED' && !incident.resolved_at) {
        updates.resolved_at = new Date()
      }
      events.push({
        event_type: next.toLowerCase(),
        old_value: incident.status,
        new_value: next,
        actor_type: 'operator',
        actor_id: op.id,
        note: body.note ? String(body.note) : undefined,
        created_at: new Date(),
      })
    }

    if (body.priority) {
      const p = String(body.priority)
      if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(p)) {
        throw new ValidationError('Invalid priority.')
      }
      if (p !== incident.priority) {
        updates.priority = p
        events.push({
          event_type: 'priority_changed',
          old_value: incident.priority,
          new_value: p,
          actor_type: 'operator',
          actor_id: op.id,
          created_at: new Date(),
        })
      }
    }

    if (body.assigned_to_id !== undefined) {
      const assignee_id = body.assigned_to_id ? String(body.assigned_to_id) : null
      updates.assigned_to_id = assignee_id
      updates.assigned_at = assignee_id ? new Date() : null
      if (assignee_id && incident.status === 'ACKNOWLEDGED') {
        updates.status = 'ASSIGNED'
        events.push({
          event_type: 'assigned',
          old_value: incident.assigned_to_id,
          new_value: assignee_id,
          actor_type: 'operator',
          actor_id: op.id,
          created_at: new Date(),
        })
      }
    }

    const updated = await db.incident.update({
      where: { id: incidentId },
      data: {
        ...updates,
        events: events.length ? { create: events } : undefined,
      },
    })

    for (const e of events) {
      await audit({
        actor_id: op.id,
        action: `incident.${e.event_type}`,
        entity_type: 'incident',
        entity_id: incidentId,
        metadata: { old: e.old_value, new: e.new_value },
      })
    }

    return Response.json({
      incident_id: updated.id,
      status: updated.status,
      priority: updated.priority,
      assigned_to_id: updated.assigned_to_id,
      acknowledged_at: updated.acknowledged_at,
      assigned_at: updated.assigned_at,
      resolved_at: updated.resolved_at,
      updated_at: updated.updated_at,
    })
  } catch (err) {
    return handleError(err)
  }
}
