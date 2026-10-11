import { db } from '@/lib/db'
import { handleError, NotFoundError } from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ nodeId: string }> }

// Allowlisted module types (spec §6.6: render only known, allowlisted module types)
const ALLOWED_MODULE_TYPES = new Set([
  'GPS',
  'CAMERA',
  'IMU',
  'ENVIRONMENT',
  'LORA',
  'BATTERY',
  'STORAGE',
  'DISPLAY',
])

const ALLOWED_MODULE_STATUS = new Set([
  'ONLINE',
  'DEGRADED',
  'OFFLINE',
  'NOT_DETECTED',
])

/**
 * GET /api/v1/nodes/{node_id}/capabilities — latest validated capability report.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { nodeId } = await params
    const report = await db.capabilityReport.findFirst({
      where: { node_id: nodeId },
      orderBy: { received_at: 'desc' },
    })
    if (!report) throw new NotFoundError()
    return Response.json(report)
  } catch (err) {
    return handleError(err)
  }
}

/**
 * POST /api/v1/nodes/{node_id}/capabilities
 * Submit an authenticated capability descriptor (spec §6.6 example).
 * Node authenticates via X-Node-Secret. Modules are validated against an allowlist.
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

    const body = await req.json().catch(() => null)
    const protocol_version = String(body?.protocol_version ?? node.protocol_version ?? '1.0')
    const firmware_version = body?.firmware_version ? String(body.firmware_version) : node.firmware_version
    const hardware_revision = body?.hardware_revision ? String(body.hardware_revision) : node.hardware_revision
    const modules = Array.isArray(body?.modules) ? body.modules : []

    // Validate each module against the allowlist
    const validationErrors: string[] = []
    for (const m of modules) {
      const type = String(m?.type ?? '').toUpperCase()
      if (!ALLOWED_MODULE_TYPES.has(type)) {
        validationErrors.push(`Unknown module type: ${type}`)
      }
      const status = String(m?.status ?? '').toUpperCase()
      if (!ALLOWED_MODULE_STATUS.has(status)) {
        validationErrors.push(`Unknown module status for ${type}: ${status}`)
      }
    }

    const valid = validationErrors.length === 0
    const descriptor_json = JSON.stringify(body)

    const report = await db.capabilityReport.create({
      data: {
        node_id: nodeId,
        protocol_version,
        firmware_version,
        hardware_revision,
        descriptor_json,
        valid,
        error_code: valid ? null : 'ALLOWLIST_VIOLATION',
        received_at: new Date(),
      },
    })

    // Update node firmware/protocol if provided
    await db.node.update({
      where: { id: nodeId },
      data: {
        firmware_version: firmware_version ?? undefined,
        protocol_version,
        hardware_revision: hardware_revision ?? undefined,
      },
    })

    // Sync modules table (upsert)
    if (valid) {
      for (const m of modules) {
        const type = String(m.type).toUpperCase()
        const moduleId = String(m.module_id ?? `${type}-${nodeId}`)
        const status = String(m.status).toUpperCase()
        const caps = Array.isArray(m.capabilities) ? m.capabilities.join(',') : ''
        const fw = m.firmware_version ? String(m.firmware_version) : null
        // Map module status to ModuleStatus enum
        const moduleStatus =
          status === 'ONLINE'
            ? 'PRESENT_ONLINE'
            : status === 'DEGRADED'
              ? 'PRESENT_DEGRADED'
              : status === 'OFFLINE'
                ? 'PRESENT_OFFLINE'
                : 'UNKNOWN'
        await db.module.upsert({
          where: { node_id_module_id: { node_id: nodeId, module_id: moduleId } },
          create: {
            node_id: nodeId,
            module_id: moduleId,
            module_type: type,
            status: moduleStatus as never,
            capabilities: caps,
            firmware_version: fw,
            last_seen_at: new Date(),
          },
          update: {
            module_type: type,
            status: moduleStatus as never,
            capabilities: caps,
            firmware_version: fw,
            last_seen_at: new Date(),
          },
        })
      }
    }

    await publishEvent({
      event_type: 'node.capabilities_updated',
      entity_id: nodeId,
      data: {
        valid,
        error_code: report.error_code,
        module_count: modules.length,
        protocol_version,
        received_at: report.received_at.toISOString(),
      },
    })

    return Response.json(
      {
        accepted: true,
        valid,
        error_code: report.error_code,
        validation_errors: validationErrors,
        received_at: report.received_at,
      },
      { status: 201 },
    )
  } catch (err) {
    return handleError(err)
  }
}
