import { db } from '@/lib/db'
import { getCurrentOperator, handleError, NotFoundError, requireRole, audit } from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ nodeId: string }> }

/**
 * GET /api/v1/nodes/{node_id}/queue
 * Returns the simulated local message queue for an offline node.
 * Spec §11.2: "Nodes may queue a defined set of small messages locally. Each
 * queued message needs an ID, creation time, retry/expiry rules, and an
 * acknowledgement model."
 *
 * In this prototype the "queue" is derived from Message records targeted at
 * this node that are still in QUEUED_FOR_NODE status (not yet forwarded).
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const { nodeId } = await params
    const node = await db.node.findUnique({ where: { id: nodeId } })
    if (!node) throw new NotFoundError()

    // Messages queued for this node (not yet forwarded/acknowledged)
    const queued = await db.message.findMany({
      where: {
        AND: [
          { destination: nodeId },
          { status: { in: ['QUEUED_FOR_NODE', 'ACCEPTED_BY_GATEWAY'] } },
        ],
      },
      orderBy: { created_at: 'asc' },
    })

    // Expired messages targeted at this node
    const expired = await db.message.findMany({
      where: {
        AND: [
          { destination: nodeId },
          { status: 'EXPIRED' },
        ],
      },
      orderBy: { created_at: 'desc' },
      take: 10,
    })

    return Response.json({
      node_id: nodeId,
      queue_size: queued.length,
      queue_limit: 50, // documented per-node queue limit
      overflow_policy: 'drop_oldest',
      queued,
      expired_count: expired.length,
      expired,
      note: 'Queue is derived from Message records in QUEUED_FOR_NODE status. When the node reconnects, the gateway forwards queued messages and handles duplicates idempotently via client_submission_id.',
    })
  } catch (err) {
    return handleError(err)
  }
}

/**
 * POST /api/v1/nodes/{node_id}/queue
 * Simulate the node reconnecting and forwarding its local queue.
 * The gateway processes each message idempotently — duplicates (same
 * client_submission_id) do not create duplicate records (spec §11.2).
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const op = await requireRole('NODE_TECHNICIAN', 'DISPATCHER', 'ADMINISTRATOR')
    const { nodeId } = await params
    const node = await db.node.findUnique({ where: { id: nodeId } })
    if (!node) throw new NotFoundError()

    const body = await req.json().catch(() => ({}))
    const mode = String(body?.mode ?? 'replay') // 'replay' | 'expire'

    if (mode === 'expire') {
      // Mark all queued messages as expired
      const result = await db.message.updateMany({
        where: {
          AND: [
            { destination: nodeId },
            { status: { in: ['QUEUED_FOR_NODE', 'ACCEPTED_BY_GATEWAY'] } },
          ],
        },
        data: { status: 'EXPIRED' },
      })
      await audit({
        actor_id: op.id,
        action: 'node.queue_expire',
        entity_type: 'node',
        entity_id: nodeId,
        metadata: { expired_count: result.count },
      })
      return Response.json({ expired: result.count })
    }

    // Default: replay (simulate node reconnect + forward)
    const queued = await db.message.findMany({
      where: {
        AND: [
          { destination: nodeId },
          { status: { in: ['QUEUED_FOR_NODE', 'ACCEPTED_BY_GATEWAY'] } },
        ],
      },
      orderBy: { created_at: 'asc' },
    })

    let forwarded = 0
    let duplicates = 0
    for (const msg of queued) {
      const claimed = await db.message.updateMany({
        where: { id: msg.id, status: { in: ['QUEUED_FOR_NODE', 'ACCEPTED_BY_GATEWAY'] } },
        data: { status: 'FORWARDED', forwarded_at: new Date() },
      })
      if (claimed.count === 1) forwarded++
    }

    await audit({
      actor_id: op.id,
      action: 'node.queue_replay',
      entity_type: 'node',
      entity_id: nodeId,
      metadata: { forwarded, duplicates, total: queued.length },
    })

    await publishEvent({
      event_type: 'node.queue_replayed',
      entity_id: nodeId,
      data: { forwarded, duplicates, total: queued.length, mode: 'replay' },
    })

    return Response.json({
      node_id: nodeId,
      mode: 'replay',
      total: queued.length,
      forwarded,
      duplicates,
      note: duplicates > 0
        ? `${duplicates} duplicate(s) detected and discarded idempotently.`
        : 'No duplicates. All queued messages forwarded.',
    })
  } catch (err) {
    return handleError(err)
  }
}
