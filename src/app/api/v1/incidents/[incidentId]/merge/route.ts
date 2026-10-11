import { db } from '@/lib/db'
import {
  getCurrentOperator,
  handleError,
  requireRole,
  audit,
  NotFoundError,
  ValidationError,
} from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ incidentId: string }> }

/**
 * POST /api/v1/incidents/{incident_id}/merge
 *
 * Merge a duplicate incident INTO this canonical incident.
 * Body: { duplicate_id: string, note?: string }
 *
 * Actions:
 *   1. The duplicate's status is set to DUPLICATE (terminal).
 *   2. The duplicate's related_incident_id is set to the canonical incident.
 *   3. Any notes from the duplicate are copied to the canonical incident (with attribution).
 *   4. An incident_event is added to both incidents recording the merge.
 *   5. Audit entry + realtime event.
 *
 * Spec §6.3: "DUPLICATE" is a valid terminal status.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const op = await requireRole('DISPATCHER', 'FIELD_COORDINATOR', 'ADMINISTRATOR')
    const { incidentId } = await params
    const body = await req.json().catch(() => ({}))
    const duplicateId = String(body?.duplicate_id ?? '').trim()
    const note = body?.note ? String(body.note).slice(0, 500) : null

    if (!duplicateId) {
      throw new ValidationError('duplicate_id is required')
    }
    if (duplicateId === incidentId) {
      throw new ValidationError('Cannot merge an incident into itself')
    }

    const [canonical, duplicate] = await Promise.all([
      db.incident.findUnique({ where: { id: incidentId }, include: { notes: true } }),
      db.incident.findUnique({ where: { id: duplicateId }, include: { notes: true } }),
    ])

    if (!canonical) throw new NotFoundError('Canonical incident not found')
    if (!duplicate) throw new NotFoundError('Duplicate incident not found')
    if (duplicate.status === 'DUPLICATE') {
      throw new ValidationError(`${duplicateId} is already marked as a duplicate`)
    }
    if (canonical.status === 'DUPLICATE') {
      throw new ValidationError(`${incidentId} is itself a duplicate — cannot merge into a duplicate`)
    }

    // 1. Mark the duplicate as DUPLICATE + link to canonical
    await db.$transaction(async (tx) => {
      await tx.incident.update({
        where: { id: duplicateId },
        data: { status: 'DUPLICATE', related_incident_id: incidentId, resolved_at: new Date() },
      })
      await tx.incidentEvent.createMany({
        data: [
          {
            incident_id: duplicateId,
            event_type: 'merged',
            old_value: duplicate.status,
            new_value: 'DUPLICATE',
            actor_type: 'operator',
            actor_id: op.id,
            note: `Merged into ${incidentId}${note ? ': ' + note : ''}`,
          },
          {
            incident_id: incidentId,
            event_type: 'duplicate_merged',
            old_value: null,
            new_value: duplicateId,
            actor_type: 'operator',
            actor_id: op.id,
            note: `${duplicateId} merged into this incident${note ? ': ' + note : ''}`,
          },
        ],
      })
      if (duplicate.notes.length > 0) {
        await tx.incidentNote.createMany({
          data: duplicate.notes.map((n) => ({
            incident_id: incidentId,
            body: `[Merged from ${duplicateId}] ${n.body}`,
            author_id: n.author_id,
          })),
        })
      }
      if (note) {
        await tx.incidentNote.create({
          data: { incident_id: incidentId, body: `Merge note: ${note}`, author_id: op.id },
        })
      }
    })

    // 6. Audit + realtime
    await audit({
      actor_id: op.id,
      action: 'incident.merge',
      entity_type: 'incident',
      entity_id: incidentId,
      metadata: { duplicate_id: duplicateId, canonical_id: incidentId },
    })
    await audit({
      actor_id: op.id,
      action: 'incident.merged_into',
      entity_type: 'incident',
      entity_id: duplicateId,
      metadata: { canonical_id: incidentId },
    })
    await publishEvent({
      event_type: 'incident.updated',
      entity_id: incidentId,
      data: { kind: 'merge', duplicate_id: duplicateId, actor_id: op.id },
    })
    await publishEvent({
      event_type: 'incident.updated',
      entity_id: duplicateId,
      data: { kind: 'merged_into', canonical_id: incidentId, new_status: 'DUPLICATE' },
    })

    return Response.json({
      canonical_id: incidentId,
      duplicate_id: duplicateId,
      merged: true,
      notes_copied: duplicate.notes.length,
      note: `${duplicateId} has been merged into ${incidentId}. The duplicate is now in DUPLICATE status (terminal).`,
    })
  } catch (err) {
    return handleError(err)
  }
}
