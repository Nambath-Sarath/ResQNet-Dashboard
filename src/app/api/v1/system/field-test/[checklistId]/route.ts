import { db } from '@/lib/db'
import { handleError, requireOperator, audit } from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ checklistId: string }> }

/**
 * PATCH /api/v1/system/field-test/{checklistId}
 * Record a pass/fail/skip result for a field-test checklist item.
 * Body: { status: 'pass' | 'fail' | 'skip', note?: string }
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const op = await requireOperator()
    const { checklistId } = await params
    const body = await req.json().catch(() => ({}))
    const status = String(body?.status ?? 'pending')
    if (!['pass', 'fail', 'skip', 'pending'].includes(status)) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'status must be pass|fail|skip|pending' } }, { status: 400 })
    }
    const note = body?.note ? String(body.note).slice(0, 500) : ''

    // Record as a system_event
    const event = await db.systemEvent.create({
      data: {
        event_type: 'field_test.result',
        severity: status === 'fail' ? 'critical' : status === 'pass' ? 'info' : 'warning',
        entity_type: 'field_test',
        entity_id: checklistId,
        payload: JSON.stringify({ checklist_id: checklistId, status, note }),
        occurred_at: new Date(),
      },
    })

    await audit({
      actor_id: op.id,
      action: 'field_test.record',
      entity_type: 'field_test',
      entity_id: checklistId,
      metadata: { status, note: note.slice(0, 100) },
    })
    await publishEvent({
      event_type: 'system.health_changed',
      entity_id: checklistId,
      data: { kind: 'field_test', status, note },
    })

    return Response.json({
      checklist_id: checklistId,
      status,
      note,
      recorded_at: event.occurred_at,
      event_id: event.id,
    })
  } catch (err) {
    return handleError(err)
  }
}
