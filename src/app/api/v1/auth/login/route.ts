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

    const sourceIp = process.env.TRUST_PROXY === 'true'
      ? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        req.headers.get('x-real-ip') ??
        'unknown'
      : 'unknown'
    const windowStart = new Date(Date.now() - 60_000)
    const recent = await db.loginAttempt.count({
      where: {
        username,
        succeeded: false,
        created_at: { gt: windowStart },
        ...(sourceIp === 'unknown' ? {} : { source_ip: sourceIp }),
      },
    })
    if (recent >= 5) {
      return errorResponse(
        'Too many login attempts. Please wait a minute.',
        'RATE_LIMITED',
        429,
      )
    }

    const result = await login(username, password)
    await db.loginAttempt.create({
      data: { username, source_ip: sourceIp, succeeded: result !== null },
    })
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
    await db.loginAttempt.deleteMany({
      where: { created_at: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
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
