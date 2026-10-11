import { db } from '@/lib/db'
import { getCurrentOperator, handleError, requireRole, audit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET /api/v1/resources/requests — list resource requests. */
export async function GET(req: Request) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const url = new URL(req.url)
    const status = url.searchParams.get('status')

    const requests = await db.resourceRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { created_at: 'desc' },
      take: 200,
      include: { resource: { select: { id: true, resource_type: true, unit: true, quantity: true } } },
    })

    return Response.json({
      requests,
      total: requests.length,
    })
  } catch (err) {
    return handleError(err)
  }
}

/** POST /api/v1/resources/requests — submit a resource request. */
export async function POST(req: Request) {
  try {
    const op = await requireRole('FIELD_COORDINATOR', 'DISPATCHER', 'ADMINISTRATOR')
    const body = await req.json().catch(() => ({}))
    const resource_type = String(body?.resource_type ?? '').trim().toUpperCase()
    const unit = String(body?.unit ?? '').trim()
    const quantity = body?.quantity != null ? Number(body.quantity) : null
    const notes = body?.notes ? String(body.notes) : null
    const requested_by = op.display_name

    if (!resource_type || !unit || quantity == null || !Number.isFinite(quantity)) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'resource_type, unit, quantity required.' } }, { status: 400 })
    }
    if (quantity <= 0) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'quantity must be positive.' } }, { status: 400 })
    }

    const request = await db.resourceRequest.create({
      data: { resource_type, unit, quantity, notes, requested_by, status: 'OPEN' },
    })

    await audit({
      actor_id: op.id,
      action: 'resource.request',
      entity_type: 'resource_request',
      entity_id: request.id,
      metadata: { resource_type, quantity },
    })

    return Response.json({ request, accepted_by_gateway: true }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
