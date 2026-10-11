import { db } from '@/lib/db'
import { handleError, NotFoundError, ValidationError } from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'
import { finiteNumber } from '@/lib/query-validation'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ nodeId: string }> }

// Threshold for node going stale (no heartbeat for 5 min)
const STALE_THRESHOLD_MS = 5 * 60_000

/**
 * POST /api/v1/nodes/{node_id}/heartbeats
 * Submit an authenticated heartbeat. In this prototype the node authenticates
 * via its `auth_secret` in the X-Node-Secret header (separate from operator auth).
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { nodeId } = await params
    const nodeSecret = req.headers.get('x-node-secret') ?? ''
    if (!nodeSecret) {
      return Response.json(
        { error: { code: 'UNAUTHENTICATED', message: 'X-Node-Secret header required.' } },
        { status: 401 },
      )
    }
    const node = await db.node.findUnique({ where: { id: nodeId } })
    if (!node) throw new NotFoundError()
    if (node.auth_secret !== nodeSecret) {
      return Response.json(
        { error: { code: 'INVALID_NODE_SECRET', message: 'Node secret mismatch.' } },
        { status: 403 },
      )
    }

    const body = await req.json().catch(() => ({}))
    const node_reported_at = body?.node_reported_at
      ? new Date(body.node_reported_at)
      : new Date()
    if (Number.isNaN(node_reported_at.getTime())) {
      throw new ValidationError('Invalid node_reported_at.')
    }
    const battery = body?.battery != null ? finiteNumber(body.battery, 'battery', { min: 0, max: 100 }) : null
    const supply_voltage = body?.supply_voltage != null ? finiteNumber(body.supply_voltage, 'supply_voltage', { min: 0, max: 100 }) : null
    const link_quality = body?.link_quality != null ? finiteNumber(body.link_quality, 'link_quality', { min: 0, max: 100 }) : null
    const uptime_seconds = body?.uptime_seconds != null ? finiteNumber(body.uptime_seconds, 'uptime_seconds', { min: 0 }) : null
    const connected_clients = body?.connected_clients != null ? finiteNumber(body.connected_clients, 'connected_clients', { min: 0, integer: true }) : null
    const rssi = body?.rssi != null ? finiteNumber(body.rssi, 'rssi', { min: -150, max: 0 }) : null

    // Determine health state
    let health_state = 'OK'
    if (battery != null && battery <= 15) health_state = 'DEGRADED'
    if (link_quality != null && link_quality < 30) health_state = 'DEGRADED'

    // Check for displacement if a location is included
    let displacementAlert = false
    if (body?.location) {
      const lat = finiteNumber(body.location.latitude, 'location.latitude', { min: -90, max: 90 })
      const lon = finiteNumber(body.location.longitude, 'location.longitude', { min: -180, max: 180 })
      const accuracy = body.location.accuracy_m != null
        ? finiteNumber(body.location.accuracy_m, 'location.accuracy_m', { min: 0 })
        : null
      const capturedAt = body.location.captured_at ? new Date(body.location.captured_at) : node_reported_at
      if (Number.isNaN(capturedAt.getTime())) {
        throw new ValidationError('Invalid location.captured_at.')
      }
      if (node.deployment_lat != null && node.deployment_lon != null) {
        const dist = haversine(node.deployment_lat, node.deployment_lon, lat, lon)
        // Conservative: only alert if distance > 200m AND accuracy < 30m.
        // A single noisy reading does not establish movement (spec §12.4).
        if (dist > 0.2 && (accuracy == null || accuracy < 30)) {
          displacementAlert = true
        }
        // store the location reading
      }
      await db.nodeLocation.create({
        data: {
          node_id: nodeId,
          latitude: lat,
          longitude: lon,
          accuracy_m: accuracy ?? null,
          source: body.location.source ?? 'GPS_MODULE',
          captured_at: capturedAt,
          valid: !displacementAlert,
        },
      })
    }

    const hb = await db.nodeHeartbeat.create({
      data: {
        node_id: nodeId,
        node_reported_at,
        battery,
        supply_voltage,
        link_quality,
        uptime_seconds,
        connected_clients,
        rssi,
        health_state,
      },
    })

    if (displacementAlert) {
      await db.nodeEvent.create({
        data: {
          node_id: nodeId,
          event_type: 'displacement',
          severity: 'critical',
          payload: JSON.stringify({ threshold_m: 200, distance_m: null }),
          occurred_at: new Date(),
        },
      })
      await publishEvent({
        event_type: 'node.displacement_warning',
        entity_id: nodeId,
        data: { severity: 'critical', note: 'Node moved beyond deployment reference threshold.' },
      })
    }

    await publishEvent({
      event_type: 'node.heartbeat_received',
      entity_id: nodeId,
      data: {
        battery,
        link_quality,
        health_state,
        connected_clients,
        received_at: hb.received_at.toISOString(),
      },
    })

    return Response.json(
      {
        accepted: true,
        node_id: nodeId,
        received_at: hb.received_at,
        health_state,
        displacement_warning: displacementAlert,
      },
      { status: 201 },
    )
  } catch (err) {
    return handleError(err)
  }
}

/** Haversine distance in km between two lat/lon points. */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // km
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Re-export threshold for use elsewhere
export { STALE_THRESHOLD_MS }
