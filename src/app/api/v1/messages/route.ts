import { db } from '@/lib/db'
import { getCurrentOperator, handleError, requireRole, audit } from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'
import { Prisma } from '@prisma/client'
import { parseLimit } from '@/lib/query-validation'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['CREATED', 'ACCEPTED_BY_GATEWAY', 'QUEUED_FOR_NODE', 'FORWARDED', 'ACKNOWLEDGED', 'FAILED', 'EXPIRED']

/** GET /api/v1/messages — message history with filters. */
export async function GET(req: Request) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const destination = url.searchParams.get('destination')
    const q = url.searchParams.get('q')?.trim()
    const limit = parseLimit(url.searchParams.get('limit'))

    const filters: Prisma.MessageWhereInput[] = []
    if (status && VALID_STATUSES.includes(status)) filters.push({ status: status as never })
    if (destination) filters.push({ destination })
    if (q) {
      filters.push({
        OR: [
          { body: { contains: q } },
          { destination: { contains: q } },
        ],
      })
    }
    const where: Prisma.MessageWhereInput = filters.length ? { AND: filters } : {}

    const messages = await db.message.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      include: { attempts: { orderBy: { attempted_at: 'desc' }, take: 3 } },
    })

    return Response.json({
      messages: messages.map((m) => ({
        id: m.id,
        source: m.source,
        destination: m.destination,
        message_type: m.message_type,
        body: m.body,
        status: m.status,
        created_at: m.created_at,
        accepted_at: m.accepted_at,
        forwarded_at: m.forwarded_at,
        acknowledged_at: m.acknowledged_at,
        expires_at: m.expires_at,
        failure_reason: m.failure_reason,
        attempts: m.attempts,
      })),
      total: messages.length,
      freshness: { last_updated_at: new Date().toISOString(), stale: false },
    })
  } catch (err) {
    return handleError(err)
  }
}

/** POST /api/v1/messages — create a message/broadcast. */
export async function POST(req: Request) {
  try {
    const op = await requireRole('DISPATCHER', 'FIELD_COORDINATOR', 'ADMINISTRATOR')
    const body = await req.json().catch(() => ({}))
    const destination = String(body?.destination ?? '').trim()
    const message_type = String(body?.message_type ?? 'text')
    const text = String(body?.body ?? '').trim()
    const ttl_seconds = body?.ttl_seconds != null ? Number(body.ttl_seconds) : 24 * 3600

    if (!destination) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'destination is required.' } }, { status: 400 })
    }
    if (!text) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'body is required.' } }, { status: 400 })
    }
    if (text.length > 4096) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'body too large (max 4096 chars).' } }, { status: 400 })
    }
    if (!Number.isFinite(ttl_seconds) || ttl_seconds < 60 || ttl_seconds > 7 * 86400) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'ttl_seconds must be between 60 and 604800.' } }, { status: 400 })
    }

    const isBroadcast = destination === 'broadcast'
    const expires_at = new Date(Date.now() + ttl_seconds * 1000)

    let message = await db.message.create({
      data: {
        source: op.id,
        destination,
        message_type,
        body: text,
        status: 'ACCEPTED_BY_GATEWAY',
        accepted_at: new Date(),
        expires_at,
      },
    })

    // If targeted at a known node, mark as queued for that node
    if (!isBroadcast) {
      const node = await db.node.findUnique({ where: { id: destination } })
      if (node) {
        message = await db.message.update({
          where: { id: message.id },
          data: { status: 'QUEUED_FOR_NODE' },
        })
      }
    }

    await audit({
      actor_id: op.id,
      action: 'message.create',
      entity_type: 'message',
      entity_id: message.id,
      metadata: { destination, message_type },
    })

    await publishEvent({
      event_type: 'message.delivery_updated',
      entity_id: message.id,
      data: {
        destination,
        status: message.status,
        source: op.id,
        source_name: op.display_name,
      },
    })

    return Response.json(
      {
        message_id: message.id,
        destination,
        status: message.status,
        accepted_at: message.accepted_at,
        expires_at: message.expires_at,
        accepted_by_gateway: true,
      },
      { status: 201 },
    )
  } catch (err) {
    return handleError(err)
  }
}
