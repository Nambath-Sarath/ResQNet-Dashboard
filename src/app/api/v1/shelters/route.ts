import { db } from '@/lib/db'
import { getCurrentOperator, handleError, requireRole, audit } from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/** GET /api/v1/shelters — shelter list/map records. */
export async function GET(req: Request) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const url = new URL(req.url)
    const status = url.searchParams.get('status')

    const shelters = await db.shelter.findMany({
      where: status ? { status } : undefined,
      orderBy: { name: 'asc' },
    })

    const enriched = shelters.map((s) => {
      const occupancy_pct = s.capacity > 0 ? Math.round((s.occupancy_estimate / s.capacity) * 100) : 0
      return {
        ...s,
        occupancy_pct,
        is_full: occupancy_pct >= 100,
        nearly_full: occupancy_pct >= 80 && occupancy_pct < 100,
      }
    })

    return Response.json({
      shelters: enriched,
      total: enriched.length,
      total_capacity: shelters.reduce((sum, s) => sum + s.capacity, 0),
      total_occupancy: shelters.reduce((sum, s) => sum + s.occupancy_estimate, 0),
      freshness: {
        last_updated_at: shelters.reduce<Date | null>(
          (latest, shelter) => !latest || shelter.updated_at > latest ? shelter.updated_at : latest,
          null,
        )?.toISOString() ?? null,
        stale: shelters.length === 0,
      },
    })
  } catch (err) {
    return handleError(err)
  }
}

/** POST /api/v1/shelters — create or update a shelter. */
export async function POST(req: Request) {
  try {
    const op = await requireRole('FIELD_COORDINATOR', 'DISPATCHER', 'ADMINISTRATOR')
    const body = await req.json().catch(() => ({}))
    const name = String(body?.name ?? '').trim()
    const latitude = body?.latitude != null ? Number(body.latitude) : null
    const longitude = body?.longitude != null ? Number(body.longitude) : null
    const capacity = body?.capacity != null ? Number(body.capacity) : null
    const occupancy_estimate = body?.occupancy_estimate != null ? Number(body.occupancy_estimate) : 0
    const status = String(body?.status ?? 'OPEN')

    if (!name || latitude == null || longitude == null || capacity == null ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        !Number.isFinite(capacity) || !Number.isFinite(occupancy_estimate)) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'name, latitude, longitude, capacity required.' } }, { status: 400 })
    }
    if (capacity <= 0 || occupancy_estimate < 0 || occupancy_estimate > capacity) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'occupancy cannot exceed capacity.' } }, { status: 400 })
    }

    // upsert by name
    const shelter = await db.shelter.upsert({
      where: { name },
      update: { latitude, longitude, capacity, occupancy_estimate, status, updated_by: op.id },
      create: { name, latitude, longitude, capacity, occupancy_estimate, status, updated_by: op.id },
    }).catch((err: unknown) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return db.shelter.update({
          where: { name },
          data: { latitude, longitude, capacity, occupancy_estimate, status, updated_by: op.id },
        })
      }
      throw err
    })

    await audit({
      actor_id: op.id,
      action: 'shelter.update',
      entity_type: 'shelter',
      entity_id: shelter.id,
      metadata: { name, capacity, occupancy_estimate },
    })
    await publishEvent({
      event_type: 'resource.updated',
      entity_id: shelter.id,
      data: { kind: 'shelter', name, occupancy_estimate, capacity },
    })

    return Response.json({ shelter, accepted_by_gateway: true }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
