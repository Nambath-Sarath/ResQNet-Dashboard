import { db } from '@/lib/db'
import {
  getCurrentOperator,
  handleError,
  requireRole,
  audit,
  NotFoundError,
  ValidationError,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/operators — list operators (admin only).
 */
export async function GET() {
  try {
    await requireRole('ADMINISTRATOR')
    const operators = await db.operator.findMany({
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        username: true,
        display_name: true,
        role: true,
        active: true,
        created_at: true,
        updated_at: true,
        _count: { select: { sessions: true } },
      },
    })
    return Response.json({
      operators: operators.map((o) => ({
        ...o,
        password_hash: undefined,
        active_sessions: o._count.sessions,
        _count: undefined,
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}

/**
 * POST /api/v1/operators — create a new operator (admin only).
 */
export async function POST(req: Request) {
  try {
    const admin = await requireRole('ADMINISTRATOR')
    const body = await req.json().catch(() => ({}))
    const username = String(body?.username ?? '').trim().toLowerCase()
    const display_name = String(body?.display_name ?? '').trim()
    const password = String(body?.password ?? '')
    const role = String(body?.role ?? 'VIEWER').toUpperCase()

    if (!username || !display_name || !password) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'username, display_name, password required.' } }, { status: 400 })
    }
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters.')
    }
    const validRoles = ['VIEWER', 'DISPATCHER', 'FIELD_COORDINATOR', 'NODE_TECHNICIAN', 'ADMINISTRATOR']
    if (!validRoles.includes(role)) {
      throw new ValidationError(`Invalid role. Allowed: ${validRoles.join(', ')}`)
    }
    if (await db.operator.findUnique({ where: { username } })) {
      return Response.json({ error: { code: 'DUPLICATE', message: `Username '${username}' already exists.` } }, { status: 409 })
    }

    // bcrypt hash the password
    const bcrypt = await import('bcryptjs')
    const password_hash = bcrypt.hashSync(password, 10)

    const op = await db.operator.create({
      data: { username, display_name, password_hash, role: role as never, active: true },
    })

    await audit({
      actor_id: admin.id,
      action: 'operator.create',
      entity_type: 'operator',
      entity_id: op.id,
      metadata: { username, role },
    })

    return Response.json(
      {
        id: op.id,
        username: op.username,
        display_name: op.display_name,
        role: op.role,
        active: op.active,
        created_at: op.created_at,
      },
      { status: 201 },
    )
  } catch (err) {
    return handleError(err)
  }
}
