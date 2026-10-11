import { db } from '@/lib/db'
import { requireRole, handleError, NotFoundError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ nodeId: string }> }

/**
 * GET /api/v1/nodes/{node_id}/__secret
 * Admin-only: returns the node's auth_secret so the dashboard's simulator
 * panel can post authenticated heartbeats / capability reports.
 *
 * In production the secret is provisioned once at registration time and never
 * travels to the browser. This endpoint exists for the demo/QA workflow only.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    await requireRole('ADMINISTRATOR')
    const { nodeId } = await params
    const node = await db.node.findUnique({ where: { id: nodeId }, select: { id: true, auth_secret: true } })
    if (!node) throw new NotFoundError()
    return Response.json({ auth_secret: node.auth_secret })
  } catch (err) {
    return handleError(err)
  }
}
