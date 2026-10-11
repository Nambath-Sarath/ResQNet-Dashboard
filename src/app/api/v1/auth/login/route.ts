import { login, withSessionCookie, errorResponse, handleError, audit } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** POST /api/v1/auth/login — local operator authentication. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const username = String(body?.username ?? '').trim()
    const password = String(body?.password ?? '')
    if (!username || !password) {
      return errorResponse('Username and password are required.', 'VALIDATION_ERROR', 400)
    }

    // naive rate-limit per username (60s window, 5 attempts)
    const recent = await db.operatorSession.findMany({
      where: {
        operator: { username },
        created_at: { gt: new Date(Date.now() - 60_000) },
      },
      select: { id: true },
    })
    if (recent.length >= 5) {
      return errorResponse(
        'Too many login attempts. Please wait a minute.',
        'RATE_LIMITED',
        429,
      )
    }

    const result = await login(username, password)
    if (!result) {
      return errorResponse('Invalid credentials.', 'INVALID_CREDENTIALS', 401)
    }

    // record audit (success)
    await audit({
      actor_type: 'operator',
      actor_id: result.user.id,
      action: 'auth.login',
      entity_type: 'operator',
      entity_id: result.user.id,
    })

    const res = Response.json({
      user: result.user,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(),
    })
    return withSessionCookie(res, result.token)
  } catch (err) {
    return handleError(err)
  }
}
