import { db } from '@/lib/db'
import { getCurrentOperator, type SessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET /api/v1/auth/me — current operator + permitted roles. */
export async function GET() {
  const op = await getCurrentOperator()
  if (!op) {
    return Response.json({ authenticated: false })
  }
  const user: SessionUser = {
    id: op.id,
    username: op.username,
    display_name: op.display_name,
    role: op.role,
  }
  // active session count for security surface
  const sessions = await db.operatorSession.count({
    where: { operator_id: op.id, expires_at: { gt: new Date() } },
  })
  return Response.json({
    authenticated: true,
    user,
    active_sessions: sessions,
  })
}
