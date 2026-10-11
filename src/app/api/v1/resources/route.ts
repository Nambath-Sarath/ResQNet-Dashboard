import { db } from '@/lib/db'
import { getCurrentOperator, handleError, requireRole, audit } from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

/** GET /api/v1/resources — resource inventory. */
export async function GET(req: Request) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const url = new URL(req.url)
    const resource_type = url.searchParams.get('type')

    const resources = await db.resource.findMany({
      where: resource_type ? { resource_type } : undefined,
      orderBy: { resource_type: 'asc' },
    })

    const enriched = resources.map((r) => {
      const available = r.quantity - r.reserved_quantity
      const low_stock_threshold = r.quantity * 0.2 // 20% of quantity
      return {
        ...r,
        available_quantity: available,
        low_stock: available <= low_stock_threshold,
      }
    })

    return Response.json({
      resources: enriched,
      total: enriched.length,
      low_stock_count: enriched.filter((r) => r.low_stock).length,
      freshness: {
        last_updated_at: resources.reduce<Date | null>(
          (latest, resource) => !latest || resource.updated_at > latest ? resource.updated_at : latest,
          null,
        )?.toISOString() ?? null,
        stale: resources.length === 0,
      },
    })
  } catch (err) {
    return handleError(err)
  }
}

/** POST /api/v1/resources — create or update a resource record. */
export async function POST(req: Request) {
  try {
    const op = await requireRole('FIELD_COORDINATOR', 'DISPATCHER', 'ADMINISTRATOR')
    const body = await req.json().catch(() => ({}))
    const resource_type = String(body?.resource_type ?? '').trim().toUpperCase()
    const unit = String(body?.unit ?? '').trim()
    const quantity = body?.quantity != null ? Number(body.quantity) : null
    const location_label = body?.location_label ? String(body.location_label).trim() : ''
    const location_lat = body?.location_lat != null ? Number(body.location_lat) : null
    const location_lon = body?.location_lon != null ? Number(body.location_lon) : null

    if (!resource_type || !unit || quantity == null || !Number.isFinite(quantity)) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'resource_type, unit, quantity are required.' } }, { status: 400 })
    }
    if (quantity < 0) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'quantity cannot be negative.' } }, { status: 400 })
    }

    const resource = await db.resource.upsert({
      where: { resource_type_location_label: { resource_type, location_label } },
      update: { quantity, unit, location_lat, location_lon, updated_by_id: op.id },
      create: {
        resource_type,
        unit,
        quantity,
        location_label,
        location_lat,
        location_lon,
        updated_by_id: op.id,
      },
    })

    await audit({
      actor_id: op.id,
      action: 'resource.update',
      entity_type: 'resource',
      entity_id: resource.id,
      metadata: { resource_type, quantity },
    })
    await publishEvent({
      event_type: 'resource.updated',
      entity_id: resource.id,
      data: { resource_type, quantity: resource.quantity, updated_by: op.display_name },
    })

    return Response.json({ resource, accepted_by_gateway: true }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
