import { db } from '@/lib/db'
import { requireOperator, handleError, audit, NotFoundError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ incidentId: string }> }

/** POST /api/v1/incidents/{incident_id}/notes — add a timestamped note. */
export async function POST(req: Request, { params }: Params) {
  try {
    const op = await requireOperator()
    const { incidentId } = await params
    const body = await req.json().catch(() => ({}))
    const noteText = String(body?.body ?? '').trim()
    if (!noteText) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'note body is required.' } }, { status: 400 })
    }

    const incident = await db.incident.findUnique({ where: { id: incidentId } })
    if (!incident) throw new NotFoundError()

    const note = await db.incidentNote.create({
      data: { incident_id: incidentId, body: noteText, author_id: op.id },
    })

    await db.incidentEvent.create({
      data: {
        incident_id: incidentId,
        event_type: 'note_added',
        new_value: 'NOTE',
        actor_type: 'operator',
        actor_id: op.id,
        note: noteText.slice(0, 200),
        created_at: note.created_at,
      },
    })

    await audit({
      actor_id: op.id,
      action: 'incident.note',
      entity_type: 'incident',
      entity_id: incidentId,
      metadata: { note_id: note.id },
    })

    return Response.json(
      {
        id: note.id,
        incident_id: incidentId,
        body: note.body,
        author: { id: op.id, display_name: op.display_name, role: op.role },
        created_at: note.created_at,
      },
      { status: 201 },
    )
  } catch (err) {
    return handleError(err)
  }
}
