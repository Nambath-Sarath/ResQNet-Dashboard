import { randomUUID, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { handleError, NotFoundError, ValidationError } from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'
import { finiteNumber } from '@/lib/query-validation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Params = { params: Promise<{ nodeId: string }> }
type JsonRecord = Record<string, unknown>

const CATEGORIES = ['RESCUE', 'MEDICAL', 'FIRE', 'FLOOD', 'STRUCTURE', 'SUPPLY', 'COMMUNICATION', 'OTHER'] as const
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const

function asRecord(value: unknown): JsonRecord | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord
  }
  return null
}

function firstValue(record: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key]
    }
  }
  return null
}

function parseReport(value: unknown): JsonRecord {
  const objectValue = asRecord(value)
  if (objectValue) return objectValue

  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      const parsedObject = asRecord(parsed)
      if (parsedObject) return parsedObject
      if (typeof parsed === 'string') return { kind: 'SOS', description: parsed }
    } catch {
      return { kind: 'SOS', description: value }
    }
  }
  throw new ValidationError('report must be a JSON object or JSON-encoded object.')
}

function secureCompare(expected: string, provided: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8')
  const providedBytes = Buffer.from(provided, 'utf8')
  return expectedBytes.length > 0 &&
    expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes)
}

function parseCapturedAt(value: unknown): Date | null {
  if (value == null || value === '') return null

  const date = typeof value === 'number'
    ? new Date(value < 10_000_000_000 ? value * 1000 : value)
    : new Date(String(value))

  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('location.captured_at is invalid.')
  }
  if (date.getTime() > Date.now() + 5 * 60_000) {
    throw new ValidationError('location.captured_at cannot be more than five minutes in the future.')
  }
  return date
}

function parseLocation(report: JsonRecord) {
  const location = asRecord(report.location) ?? asRecord(report.g) ??
    ((report.latitude != null || report.lat_e6 != null) ? report : null)

  if (!location) return null

  const latitudeRaw = firstValue(location, ['latitude', 'lat', 'a'])
  const longitudeRaw = firstValue(location, ['longitude', 'lon', 'lng', 'o'])
  const latitudeE6 = firstValue(location, ['lat_e6'])
  const longitudeE6 = firstValue(location, ['lon_e6', 'lng_e6'])

  const hasLatitude = latitudeRaw != null || latitudeE6 != null
  const hasLongitude = longitudeRaw != null || longitudeE6 != null
  if (!hasLatitude && !hasLongitude) return null
  if (!hasLatitude || !hasLongitude) {
    throw new ValidationError('Both latitude and longitude are required when a location is supplied.')
  }

  const latitude = latitudeE6 != null
    ? finiteNumber(latitudeE6, 'location.lat_e6', { min: -90_000_000, max: 90_000_000, integer: true }) / 1_000_000
    : finiteNumber(latitudeRaw, 'location.latitude', { min: -90, max: 90 })
  const longitude = longitudeE6 != null
    ? finiteNumber(longitudeE6, 'location.lon_e6', { min: -180_000_000, max: 180_000_000, integer: true }) / 1_000_000
    : finiteNumber(longitudeRaw, 'location.longitude', { min: -180, max: 180 })

  const accuracyRaw = firstValue(location, ['accuracy_m', 'accuracy', 'acc_m', 'x'])
  const accuracy = accuracyRaw == null
    ? null
    : finiteNumber(accuracyRaw, 'location.accuracy_m', { min: 0, max: 1_000_000 })

  const rawSource = String(firstValue(location, ['source', 's']) ?? 'BROWSER_GNSS').trim().toUpperCase()
  const sourceAliases: Record<string, string> = {
    PHONE_GPS: 'BROWSER_GNSS',
    GPS: 'BROWSER_GNSS',
    GNSS: 'BROWSER_GNSS',
    BROWSER_GNSS: 'BROWSER_GNSS',
    NODE_GPS: 'NODE_GPS',
    MANUAL: 'MANUAL',
    APPROXIMATE: 'APPROXIMATE',
  }
  const source = sourceAliases[rawSource]
  if (!source) throw new ValidationError('location.source is not supported.')

  return {
    latitude,
    longitude,
    accuracy_m: accuracy,
    source,
    captured_at: parseCapturedAt(firstValue(location, ['captured_at', 'timestamp', 't'])),
  }
}

/**
 * POST /api/v1/nodes/{gatewayNodeId}/reports
 *
 * The Raspberry Pi posts reports read from the gateway USB serial stream.
 * The gateway authenticates with its per-node X-Node-Secret. The original
 * source node and radio sequence are the idempotency key.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { nodeId: gatewayNodeId } = await params
    const providedSecret = req.headers.get('x-node-secret') ?? ''
    if (!providedSecret) {
      return Response.json(
        { error: { code: 'UNAUTHENTICATED', message: 'X-Node-Secret header required.' } },
        { status: 401 },
      )
    }

    const gateway = await db.node.findUnique({
      where: { id: gatewayNodeId },
      select: { id: true, display_name: true, auth_secret: true },
    })
    if (!gateway) throw new NotFoundError()
    if (!secureCompare(gateway.auth_secret, providedSecret)) {
      return Response.json(
        { error: { code: 'INVALID_NODE_SECRET', message: 'Gateway secret mismatch.' } },
        { status: 403 },
      )
    }

    const body: unknown = await req.json().catch(() => null)
    const bodyObject = asRecord(body)
    if (!bodyObject) throw new ValidationError('A JSON request body is required.')

    const sourceNodeId = String(bodyObject.source_node_id ?? '').trim()
    if (!/^RQ-[A-Za-z0-9-]{6,40}$/.test(sourceNodeId)) {
      throw new ValidationError('source_node_id must be a valid ResQnet node ID.')
    }

    const sequence = finiteNumber(bodyObject.sequence, 'sequence', {
      min: 0,
      max: 4_294_967_295,
      integer: true,
    })

    const rawReport = bodyObject.report ?? bodyObject.payload
    const report = parseReport(rawReport)
    if (JSON.stringify(report).length > 4096) {
      throw new ValidationError('Report payload is too large.')
    }

    const kind = String(firstValue(report, ['kind', 'type', 'report_type', 'k']) ?? 'SOS')
      .trim().toUpperCase().replace(/[\s-]+/g, '_')

    const inferredCategory =
      kind.includes('MEDICAL') ? 'MEDICAL' :
      kind.includes('FIRE') ? 'FIRE' :
      kind.includes('FLOOD') ? 'FLOOD' :
      kind.includes('STRUCTURE') ? 'STRUCTURE' :
      kind.includes('SUPPLY') ? 'SUPPLY' :
      kind.includes('SAFE') || kind.includes('WAITING') ? 'OTHER' :
      'RESCUE'

    const requestedCategory = String(report.category ?? inferredCategory).trim().toUpperCase()
    const category = CATEGORIES.includes(requestedCategory as never)
      ? requestedCategory
      : inferredCategory

    const defaultPriority =
      kind.includes('SAFE') || kind.includes('WAITING') ? 'LOW' :
      kind.includes('MEDICAL') || kind.includes('FIRE') || kind.includes('FLOOD') ? 'HIGH' :
      'CRITICAL'
    const requestedPriority = String(report.priority ?? defaultPriority).trim().toUpperCase()
    const priority = PRIORITIES.includes(requestedPriority as never)
      ? requestedPriority
      : defaultPriority

    const rawDescription = firstValue(report, ['description', 'details', 'message', 'text', 'd'])
    const fallbackDescription =
      kind.includes('SAFE') || kind.includes('WAITING') ? 'Safe & waiting' :
      kind.includes('MEDICAL') ? 'Medical emergency' :
      'Emergency assistance requested'
    const description = String(rawDescription ?? fallbackDescription).trim().slice(0, 1200)
    if (!description) throw new ValidationError('Report description cannot be empty.')

    const peopleRaw = firstValue(report, ['people_affected', 'people', 'count', 'p'])
    const peopleAffected = peopleRaw == null
      ? null
      : finiteNumber(peopleRaw, 'people_affected', { min: 0, max: 1_000_000, integer: true })

    const location = parseLocation(report)

    // source_node_id is an untrusted origin claim from the current demo mesh.
    // The authenticated gateway is used as the FK fallback if the end node
    // has not been registered in the dashboard yet.
    const sourceNode = await db.node.findUnique({
      where: { id: sourceNodeId },
      select: { id: true },
    })
    const persistedSourceNodeId = sourceNode?.id ?? gatewayNodeId
    const clientSubmissionId = sourceNodeId + ':' + sequence.toString()

    const existing = await db.incident.findFirst({
      where: {
        source_node_id: persistedSourceNodeId,
        client_submission_id: clientSubmissionId,
      },
      select: { id: true, status: true, created_at: true },
    })
    if (existing) {
      return Response.json({
        incident_id: existing.id,
        status: existing.status,
        created_at: existing.created_at,
        accepted_by_command_center: true,
        duplicate: true,
      })
    }

    const incidentId = 'SOS-' + Date.now().toString(36).toUpperCase() + '-' +
      randomUUID().slice(0, 8).toUpperCase()

    let incident
    try {
      incident = await db.incident.create({
        data: {
          id: incidentId,
          client_submission_id: clientSubmissionId,
          category: category as never,
          priority: priority as never,
          status: 'NEW',
          description: sourceNode ? description : '[Origin ' + sourceNodeId + '] ' + description,
          people_affected: peopleAffected,
          source_type: 'survivor_portal',
          source_node_id: persistedSourceNodeId,
          location_lat: location?.latitude ?? null,
          location_lon: location?.longitude ?? null,
          location_source: location?.source ?? null,
          location_accuracy_m: location?.accuracy_m ?? null,
          location_captured_at: location?.captured_at ?? null,
          events: {
            create: {
              event_type: 'created',
              actor_type: 'node',
              actor_id: gatewayNodeId,
              new_value: 'NEW',
              note: 'Received through gateway ' + gatewayNodeId +
                '; reported origin ' + sourceNodeId + '; sequence ' + sequence.toString() + '.',
            },
          },
        },
      })
    } catch (error) {
      // A serial retry can race the first insert. Resolve it through the
      // unique source-node/submission key before returning the original error.
      const raced = await db.incident.findFirst({
        where: {
          source_node_id: persistedSourceNodeId,
          client_submission_id: clientSubmissionId,
        },
        select: { id: true, status: true, created_at: true },
      })
      if (!raced) throw error
      return Response.json({
        incident_id: raced.id,
        status: raced.status,
        created_at: raced.created_at,
        accepted_by_command_center: true,
        duplicate: true,
      })
    }

    await db.auditLog.create({
      data: {
        actor_type: 'node',
        action: 'incident.gateway_ingest',
        entity_type: 'incident',
        entity_id: incident.id,
        metadata: JSON.stringify({
          gateway_node_id: gatewayNodeId,
          source_node_id: sourceNodeId,
          sequence,
          location_source: location?.source ?? null,
          location_available: !!location,
        }),
      },
    })

    await publishEvent({
      event_type: 'incident.created',
      entity_id: incident.id,
      data: {
        status: incident.status,
        category: incident.category,
        priority: incident.priority,
        source_node_id: incident.source_node_id,
        source_type: incident.source_type,
        created_at: incident.created_at.toISOString(),
        location_available: !!location,
      },
    })

    return Response.json(
      {
        incident_id: incident.id,
        status: incident.status,
        created_at: incident.created_at,
        accepted_by_command_center: true,
        duplicate: false,
      },
      { status: 201 },
    )
  } catch (error) {
    return handleError(error)
  }
}
