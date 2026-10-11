import { db } from '@/lib/db'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import type { Operator, OperatorRole } from '@prisma/client'

export const SESSION_COOKIE = 'resqnet_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 12 // 12 hours
export const WRITE_ROLES: OperatorRole[] = [
  'DISPATCHER',
  'FIELD_COORDINATOR',
  'NODE_TECHNICIAN',
  'ADMINISTRATOR',
]

export type SessionUser = {
  id: string
  username: string
  display_name: string
  role: OperatorRole
}

/**
 * Validate username/password and create a session. Returns the session token
 * (to be set as an httpOnly cookie by the caller) and the safe user object.
 */
export async function login(
  username: string,
  password: string,
): Promise<{ token: string; user: SessionUser } | null> {
  const op = await db.operator.findUnique({ where: { username } })
  if (!op || !op.active) return null
  const ok = await bcrypt.compare(password, op.password_hash)
  if (!ok) return null

  const token = randomUUID()
  const expires_at = new Date(Date.now() + SESSION_TTL_MS)
  await db.operatorSession.create({
    data: {
      operator_id: op.id,
      token,
      expires_at,
    },
  })
  return {
    token,
    user: {
      id: op.id,
      username: op.username,
      display_name: op.display_name,
      role: op.role,
    },
  }
}

/** Destroy the session bound to the request cookie. */
export async function logout(): Promise<void> {
  const token = await readSessionToken()
  if (!token) return
  await db.operatorSession.deleteMany({ where: { token } }).catch(() => {})
}

/** Read the session token from the incoming request cookies. */
export async function readSessionToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value ?? null
}

/** Resolve the current operator from the session cookie, or null. */
export async function getCurrentOperator(): Promise<Operator | null> {
  const token = await readSessionToken()
  if (!token) return null
  const session = await db.operatorSession.findUnique({
    where: { token },
    include: { operator: true },
  })
  if (!session) return null
  if (session.expires_at.getTime() < Date.now()) {
    await db.operatorSession.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  if (!session.operator.active) return null
  return session.operator
}

/** Require an authenticated operator; throws a 401-shaped error otherwise. */
export async function requireOperator(): Promise<Operator> {
  const op = await getCurrentOperator()
  if (!op) {
    throw new UnauthorizedError()
  }
  return op
}

/** Require an authenticated operator with one of the allowed roles. */
export async function requireRole(...allowed: OperatorRole[]): Promise<Operator> {
  const op = await requireOperator()
  if (!allowed.includes(op.role)) {
    throw new ForbiddenError()
  }
  return op
}

export class UnauthorizedError extends Error {
  status = 401
  code = 'UNAUTHENTICATED'
}
export class ForbiddenError extends Error {
  status = 403
  code = 'FORBIDDEN'
}
export class ValidationError extends Error {
  status = 400
  code = 'VALIDATION_ERROR'
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}
export class NotFoundError extends Error {
  status = 404
  code = 'NOT_FOUND'
}

/** Standard JSON error envelope used by all API routes. */
export function errorResponse(
  message: string,
  code: string,
  status = 400,
  requestId?: string,
): Response {
  return new Response(
    JSON.stringify({
      error: { code, message, request_id: requestId ?? null },
    }),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  )
}

/** Convert any thrown error into a JSON error response. */
export function handleError(err: unknown): Response {
  if (err instanceof UnauthorizedError) {
    return errorResponse('Authentication required.', 'UNAUTHENTICATED', 401)
  }
  if (err instanceof ForbiddenError) {
    return errorResponse('You do not have permission to perform this action.', 'FORBIDDEN', 403)
  }
  if (err instanceof ValidationError) {
    return errorResponse(err.message, 'VALIDATION_ERROR', 400)
  }
  if (err instanceof NotFoundError) {
    return errorResponse('Resource not found.', 'NOT_FOUND', 404)
  }
  console.error('[api] unhandled error', err)
  return errorResponse('Internal server error.', 'INTERNAL_ERROR', 500)
}

/** Set the session cookie on a Response. */
export function withSessionCookie(res: Response, token: string): Response {
  res.headers.append(
    'set-cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`,
  )
  return res
}

/** Clear the session cookie on a Response. */
export function clearSessionCookie(res: Response): Response {
  res.headers.append(
    'set-cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  )
  return res
}

/** Record an audit entry (fire-and-forget). */
export async function audit(params: {
  actor_type?: string
  actor_id?: string | null
  action: string
  entity_type?: string
  entity_id?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actor_type: params.actor_type ?? 'operator',
        actor_id: params.actor_id ?? null,
        action: params.action,
        entity_type: params.entity_type ?? null,
        entity_id: params.entity_id ?? null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        timestamp: new Date(),
      },
    })
  } catch (e) {
    console.error('[audit] failed to write', e)
  }
}
