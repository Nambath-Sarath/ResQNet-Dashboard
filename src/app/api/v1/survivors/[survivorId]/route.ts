import { db } from '@/lib/db'
import { getCurrentOperator, handleError, NotFoundError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ survivorId: string }> }

/** GET /api/v1/survivors/{id} — survivor report detail. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const canSeeContact = ['ADMINISTRATOR', 'DISPATCHER', 'FIELD_COORDINATOR'].includes(op.role)
    const { survivorId } = await params
    const survivor = await db.survivor.findUnique({ where: { id: survivorId } })
    if (!survivor) throw new NotFoundError()
    return Response.json({
      ...survivor,
      display_name: canSeeContact ? survivor.display_name : null,
      contact: canSeeContact ? survivor.contact : null,
    })
  } catch (err) {
    return handleError(err)
  }
}
