import { db } from '@/lib/db'
import { getCurrentOperator, handleError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/reports/trends?hours=24
 * Returns incident creation counts bucketed by hour for the given window.
 * Used by the Overview trends sparkline.
 */
export async function GET(req: Request) {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const url = new URL(req.url)
    const hours = Math.min(168, Math.max(1, Number(url.searchParams.get('hours') ?? 24)))
    const since = new Date(Date.now() - hours * 3600_000)

    const incidents = await db.incident.findMany({
      where: { created_at: { gte: since } },
      select: { created_at: true, priority: true, status: true },
      orderBy: { created_at: 'asc' },
    })

    // Bucket by hour
    const now = Date.now()
    const buckets: { hour: string; count: number; critical: number; resolved: number }[] = []
    for (let i = hours - 1; i >= 0; i--) {
      const bucketStart = new Date(now - i * 3600_000)
      buckets.push({
        hour: bucketStart.toISOString(),
        count: 0,
        critical: 0,
        resolved: 0,
      })
    }

    for (const inc of incidents) {
      const incHour = inc.created_at.getTime()
      for (let i = 0; i < buckets.length; i++) {
        const bucketTime = new Date(buckets[i].hour).getTime()
        if (incHour >= bucketTime && incHour < bucketTime + 3600_000) {
          buckets[i].count++
          if (inc.priority === 'CRITICAL') buckets[i].critical++
          if (inc.status === 'RESOLVED') buckets[i].resolved++
          break
        }
      }
    }

    // Node activity trend (heartbeats received per hour)
    const heartbeats = await db.nodeHeartbeat.findMany({
      where: { received_at: { gte: since } },
      select: { received_at: true },
    })
    const hbBuckets = buckets.map((b) => ({ hour: b.hour, heartbeats: 0 }))
    for (const hb of heartbeats) {
      const hbTime = hb.received_at.getTime()
      for (let i = 0; i < hbBuckets.length; i++) {
        const bucketTime = new Date(hbBuckets[i].hour).getTime()
        if (hbTime >= bucketTime && hbTime < bucketTime + 3600_000) {
          hbBuckets[i].heartbeats++
          break
        }
      }
    }

    const peak = buckets.reduce((max, b) => (b.count > max ? b.count : max), 0)
    const total = buckets.reduce((sum, b) => sum + b.count, 0)
    const totalCritical = buckets.reduce((sum, b) => sum + b.critical, 0)

    return Response.json({
      window_hours: hours,
      since: since.toISOString(),
      generated_at: new Date().toISOString(),
      incidents: buckets,
      heartbeats: hbBuckets,
      summary: {
        total_incidents: total,
        total_critical: totalCritical,
        peak_per_hour: peak,
        avg_per_hour: total / hours,
      },
    })
  } catch (err) {
    return handleError(err)
  }
}
