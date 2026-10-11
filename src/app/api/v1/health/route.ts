import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** GET /api/v1/health — minimal public health probe. */
export async function GET() {
  let db_ok = false
  try {
    await db.$queryRaw`SELECT 1`
    db_ok = true
  } catch {
    db_ok = false
  }
  return Response.json({
    status: db_ok ? 'ok' : 'degraded',
    service: 'resqnet-gateway',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    database: db_ok ? 'connected' : 'unreachable',
  })
}
