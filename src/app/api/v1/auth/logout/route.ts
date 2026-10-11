import { logout, clearSessionCookie, getCurrentOperator, handleError, audit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** POST /api/v1/auth/logout — end the current session. */
export async function POST() {
  try {
    const op = await getCurrentOperator()
    if (op) {
      await audit({
        actor_type: 'operator',
        actor_id: op.id,
        action: 'auth.logout',
        entity_type: 'operator',
        entity_id: op.id,
      })
    }
    await logout()
    const res = new Response(null, { status: 204 })
    return clearSessionCookie(res)
  } catch (err) {
    return handleError(err)
  }
}
