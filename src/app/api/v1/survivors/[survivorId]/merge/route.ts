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

type Params = { params: Promise<{ survivorId: string }> }

/**
 * POST /api/v1/survivors/{survivor_id}/merge
 *
 * Merge a duplicate survivor record INTO this canonical survivor.
 * Body: { duplicate_id: string, note?: string }
 *
 * Actions:
 *   1. The duplicate's status is set to 'closed' with a note linking to the canonical.
 *   2. The canonical's notes are appended with the duplicate's notes + a merge note.
 *   3. Any incidents sourced from the duplicate's node are NOT redirected (they keep
 *      their original survivor association if any — this prototype doesn't link
 *      incidents to survivors directly).
 *   4. Audit entry + realtime event.
 *
 * Spec §6.4: "Related duplicate records and merge history."
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const op = await requireRole('FIELD_COORDINATOR', 'DISPATCHER', 'ADMINISTRATOR')
    const { survivorId } = await params
    const body = await req.json().catch(() => ({}))
    const duplicateId = String(body?.duplicate_id ?? '').trim()
    const note = body?.note ? String(body.note).slice(0, 500) : null

    if (!duplicateId) {
      throw new ValidationError('duplicate_id is required')
    }
    if (duplicateId === survivorId) {
      throw new ValidationError('Cannot merge a survivor into itself')
    }

    const [canonical, duplicate] = await Promise.all([
      db.survivor.findUnique({ where: { id: survivorId } }),
      db.survivor.findUnique({ where: { id: duplicateId } }),
    ])

    if (!canonical) throw new NotFoundError('Canonical survivor not found')
    if (!duplicate) throw new NotFoundError('Duplicate survivor not found')
    if (duplicate.status === 'closed') {
      throw new ValidationError(`${duplicate.temporary_ref} is already closed`)
    }

    // 1. Mark the duplicate as closed + link via notes
    const mergeNote = [
      canonical.notes ?? '',
      `[Merged ${duplicate.temporary_ref} on ${new Date().toISOString()}]`,
      note ?? '',
      duplicate.notes ? `Original notes from ${duplicate.temporary_ref}: ${duplicate.notes}` : '',
    ].filter(Boolean).join('\n')

    await db.$transaction([
      db.survivor.update({
        where: { id: duplicateId },
        data: { status: 'closed', notes: `Merged into ${canonical.temporary_ref}${note ? ': ' + note : ''}` },
      }),
      db.survivor.update({ where: { id: survivorId }, data: { notes: mergeNote } }),
    ])

    // 3. Audit + realtime
    await audit({
      actor_id: op.id,
      action: 'survivor.merge',
      entity_type: 'survivor',
      entity_id: survivorId,
      metadata: { duplicate_id: duplicateId, canonical_id: survivorId },
    })
    await audit({
      actor_id: op.id,
      action: 'survivor.merged_into',
      entity_type: 'survivor',
      entity_id: duplicateId,
      metadata: { canonical_id: survivorId },
    })
    await publishEvent({
      event_type: 'survivor.updated',
      entity_id: survivorId,
      data: { kind: 'merge', duplicate_id: duplicateId, actor_id: op.id },
    })
    await publishEvent({
      event_type: 'survivor.updated',
      entity_id: duplicateId,
      data: { kind: 'merged_into', canonical_id: survivorId, new_status: 'closed' },
    })

    return Response.json({
      canonical_id: survivorId,
      canonical_ref: canonical.temporary_ref,
      duplicate_id: duplicateId,
      duplicate_ref: duplicate.temporary_ref,
      merged: true,
      note: `${duplicate.temporary_ref} has been merged into ${canonical.temporary_ref}. The duplicate is now closed.`,
    })
  } catch (err) {
    return handleError(err)
  }
}
