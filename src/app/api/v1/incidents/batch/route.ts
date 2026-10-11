import { db } from '@/lib/db'
import {
  getCurrentOperator,
  handleError,
  requireOperator,
  audit,
  ValidationError,
} from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

const VALID_ACTIONS = ['acknowledge', 'assign', 'cancel'] as const
type BatchAction = (typeof VALID_ACTIONS)[number]

const STATUS_TRANSITIONS: Record<string, string[]> = {
  NEW: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['ASSIGNED', 'CANCELLED'],
}

/**
 * POST /api/v1/incidents/batch
 * Apply an action to multiple incidents at once (acknowledge / assign / cancel).
 * Returns per-incident results so the client can show partial failures.
 *
 * Body: {
 *   action: 'acknowledge' | 'assign' | 'cancel',
 *   incident_ids: string[],
 *   assignee_id?: string  (only for 'assign')
 *   note?: string
 * }
 */
export async function POST(req: Request) {
  try {
    const op = await requireOperator()
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action ?? '').toLowerCase() as BatchAction
    const incident_ids: string[] = Array.isArray(body?.incident_ids) ? body.incident_ids : []
    const assignee_id = body?.assignee_id ? String(body.assignee_id) : null
    const note = body?.note ? String(body.note).slice(0, 500) : null

    if (!VALID_ACTIONS.includes(action)) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: `action must be one of: ${VALID_ACTIONS.join(', ')}` } },
        { status: 400 },
      )
    }
    if (incident_ids.length === 0) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'incident_ids must be a non-empty array' } },
        { status: 400 },
      )
    }
    if (incident_ids.length > 100) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Cannot batch more than 100 incidents at once' } },
        { status: 400 },
      )
    }
    if (action === 'assign' && !assignee_id) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'assignee_id is required for assign action' } },
        { status: 400 },
      )
    }

    // Verify assignee exists if provided
    if (assignee_id) {
      const assignee = await db.operator.findUnique({ where: { id: assignee_id } })
      if (!assignee || !assignee.active) {
        return Response.json(
          { error: { code: 'NOT_FOUND', message: 'Assignee operator not found or inactive' } },
          { status: 404 },
        )
      }
    }

    const results: Array<{
      incident_id: string
      ok: boolean
      error?: string
      new_status?: string
    }> = []

    for (const incidentId of incident_ids) {
      try {
        const incident = await db.incident.findUnique({ where: { id: incidentId } })
        if (!incident) {
          results.push({ incident_id: incidentId, ok: false, error: 'not_found' })
          continue
        }

        // Determine the target status
        let targetStatus: string | null = null
        if (action === 'acknowledge') {
          const allowed = STATUS_TRANSITIONS[incident.status] ?? []
          if (!allowed.includes('ACKNOWLEDGED')) {
            results.push({ incident_id: incidentId, ok: false, error: `cannot acknowledge from ${incident.status}` })
            continue
          }
          targetStatus = 'ACKNOWLEDGED'
        } else if (action === 'cancel') {
          const allowed = STATUS_TRANSITIONS[incident.status] ?? []
          if (!allowed.includes('CANCELLED')) {
            results.push({ incident_id: incidentId, ok: false, error: `cannot cancel from ${incident.status}` })
            continue
          }
          targetStatus = 'CANCELLED'
        } else if (action === 'assign') {
          // Assign moves to ASSIGNED if currently ACKNOWLEDGED, otherwise just sets assignee
          if (incident.status === 'ACKNOWLEDGED') {
            targetStatus = 'ASSIGNED'
          } else if (!['NEW', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS'].includes(incident.status)) {
            results.push({ incident_id: incidentId, ok: false, error: `cannot assign from ${incident.status}` })
            continue
          }
        }

        const updates: Record<string, unknown> = {}
        const events: { event_type: string; old_value: string | null; new_value: string; actor_type: string; actor_id: string; note?: string; created_at: Date }[] = []

        if (targetStatus) {
          updates.status = targetStatus
          if (targetStatus === 'ACKNOWLEDGED' && !incident.acknowledged_at) {
            updates.acknowledged_at = new Date()
          }
          events.push({
            event_type: targetStatus.toLowerCase(),
            old_value: incident.status,
            new_value: targetStatus,
            actor_type: 'operator',
            actor_id: op.id,
            note: note ?? undefined,
            created_at: new Date(),
          })
        }

        if (action === 'assign' && assignee_id) {
          updates.assigned_to_id = assignee_id
          updates.assigned_at = new Date()
          events.push({
            event_type: 'assigned',
            old_value: incident.assigned_to_id,
            new_value: assignee_id,
            actor_type: 'operator',
            actor_id: op.id,
            created_at: new Date(),
          })
        }

        const updated = await db.incident.update({
          where: { id: incidentId },
          data: {
            ...updates,
            events: events.length ? { create: events } : undefined,
          },
        })

        // Audit + publish per incident
        await audit({
          actor_id: op.id,
          action: `incident.batch_${action}`,
          entity_type: 'incident',
          entity_id: incidentId,
          metadata: { target_status: targetStatus, assignee_id, batch: true },
        })
        await publishEvent({
          event_type: targetStatus ? `incident.${targetStatus.toLowerCase()}` : 'incident.updated',
          entity_id: incidentId,
          data: {
            old_value: incident.status,
            new_value: targetStatus ?? incident.status,
            actor_id: op.id,
            actor_name: op.display_name,
            batch: true,
          },
        })

        results.push({ incident_id: incidentId, ok: true, new_status: updated.status })
      } catch (e) {
        results.push({ incident_id: incidentId, ok: false, error: String(e) })
      }
    }

    const succeeded = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok).length

    return Response.json({
      action,
      total: incident_ids.length,
      succeeded,
      failed,
      results,
      note: failed > 0 ? `${failed} incident(s) could not be updated (see per-incident errors).` : 'All incidents updated.',
    })
  } catch (err) {
    return handleError(err)
  }
}
