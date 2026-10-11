import { db } from '@/lib/db'
import {
  handleError,
  requireRole,
  audit,
  NotFoundError,
  ValidationError,
} from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ nodeId: string }> }

/**
 * POST /api/v1/nodes/{node_id}/deployment
 * Set or update the locked deployment reference coordinates.
 * Requires NODE_TECHNICIAN or ADMINISTRATOR. Creates an audit event + realtime event.
 * Spec §6.5: "Locking a reference location should store who set it and when."
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const op = await requireRole('NODE_TECHNICIAN', 'ADMINISTRATOR')
    const { nodeId } = await params
    const body = await req.json().catch(() => ({}))

    const lat = Number(body?.latitude)
    const lon = Number(body?.longitude)
    const accuracy_m = body?.accuracy_m != null ? Number(body.accuracy_m) : null
    const confirm = body?.confirm === true

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      throw new ValidationError('Valid latitude and longitude are required.')
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new ValidationError('Coordinates out of valid range.')
    }

    const node = await db.node.findUnique({ where: { id: nodeId } })
    if (!node) throw new NotFoundError()

    // Require explicit confirmation if the deployment is already set and node is deployed
    if (node.deployment_locked_at && node.lifecycle_state === 'DEPLOYED' && !confirm) {
      return Response.json(
        {
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message:
              'This node is already deployed with a locked reference. Set confirm:true to override. The change will be audited.',
          },
          current: {
            lat: node.deployment_lat,
            lon: node.deployment_lon,
            locked_at: node.deployment_locked_at,
            locked_by: node.deployment_locked_by,
          },
        },
        { status: 409 },
      )
    }

    const previous = {
      lat: node.deployment_lat,
      lon: node.deployment_lon,
      locked_at: node.deployment_locked_at,
      locked_by: node.deployment_locked_by,
    }

    const updated = await db.node.update({
      where: { id: nodeId },
      data: {
        deployment_lat: lat,
        deployment_lon: lon,
        deployment_accuracy_m: accuracy_m,
        deployment_locked_by: op.id,
        deployment_locked_at: new Date(),
      },
    })

    await db.nodeEvent.create({
      data: {
        node_id: nodeId,
        event_type: 'deployment_locked',
        severity: 'info',
        payload: JSON.stringify({
          previous,
          next: { lat, lon, accuracy_m },
          by: op.id,
        }),
        occurred_at: new Date(),
      },
    })

    await audit({
      actor_id: op.id,
      action: 'node.deployment_lock',
      entity_type: 'node',
      entity_id: nodeId,
      metadata: { previous, next: { lat, lon, accuracy_m } },
    })

    await publishEvent({
      event_type: 'node.deployment_updated',
      entity_id: nodeId,
      data: {
        latitude: lat,
        longitude: lon,
        accuracy_m,
        locked_by: op.id,
        locked_by_name: op.display_name,
        locked_at: updated.deployment_locked_at?.toISOString(),
        previous,
      },
    })

    return Response.json({
      node_id: nodeId,
      deployment_lat: lat,
      deployment_lon: lon,
      deployment_accuracy_m: accuracy_m,
      locked_by: op.id,
      locked_by_name: op.display_name,
      locked_at: updated.deployment_locked_at,
    })
  } catch (err) {
    return handleError(err)
  }
}
