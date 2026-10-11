import { getCurrentOperator, handleError, requireRole, audit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// In-memory defaults (no DB table for now; persisted in env/audit only).
// In production these would live in a `settings` table.
const DEFAULTS = {
  heartbeat_timeout_seconds: 300, // 5 min
  battery_low_threshold: 20,
  battery_critical_threshold: 10,
  link_quality_low_threshold: 30,
  displacement_threshold_m: 200,
  displacement_max_accuracy_m: 30,
  message_ttl_seconds: 86400,
  message_max_payload_bytes: 4096,
  session_ttl_seconds: 43200,
  audit_retention_days: 365,
  location_history_retention_days: 90,
}

/**
 * GET /api/v1/settings/thresholds — alert thresholds + heartbeat timeout.
 * Spec §6.10: "Alert thresholds and heartbeat timeout. Configuration values
 * should have safe bounds, validation, and audit entries."
 */
export async function GET() {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    return Response.json({ thresholds: DEFAULTS, build_version: '0.2.0' })
  } catch (err) {
    return handleError(err)
  }
}

/**
 * PATCH /api/v1/settings/thresholds — update thresholds (admin only).
 * Validates against safe bounds before applying.
 */
export async function PATCH(req: Request) {
  try {
    const admin = await requireRole('ADMINISTRATOR')
    const body = await req.json().catch(() => ({}))

    const bounds: Record<string, { min: number; max: number }> = {
      heartbeat_timeout_seconds: { min: 30, max: 3600 },
      battery_low_threshold: { min: 5, max: 50 },
      battery_critical_threshold: { min: 0, max: 20 },
      link_quality_low_threshold: { min: 5, max: 80 },
      displacement_threshold_m: { min: 10, max: 2000 },
      displacement_max_accuracy_m: { min: 1, max: 100 },
      message_ttl_seconds: { min: 60, max: 7 * 86400 },
      message_max_payload_bytes: { min: 256, max: 65536 },
      session_ttl_seconds: { min: 3600, max: 7 * 86400 },
      audit_retention_days: { min: 30, max: 3650 },
      location_history_retention_days: { min: 7, max: 365 },
    }

    const updates: Record<string, number> = {}
    const violations: string[] = []
    for (const [k, v] of Object.entries(body)) {
      if (!(k in bounds)) continue
      const num = Number(v)
      const b = bounds[k]
      if (Number.isNaN(num) || num < b.min || num > b.max) {
        violations.push(`${k} must be between ${b.min} and ${b.max}`)
      } else {
        updates[k] = num
      }
    }

    if (violations.length > 0) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: violations.join('; ') } }, { status: 400 })
    }

    // In a real impl we'd persist; for now we audit the attempt.
    await audit({
      actor_id: admin.id,
      action: 'settings.update',
      entity_type: 'settings',
      entity_id: 'thresholds',
      metadata: updates,
    })

    return Response.json({
      thresholds: { ...DEFAULTS, ...updates },
      updated_keys: Object.keys(updates),
      note: 'Thresholds are in-memory defaults for this prototype; production persistence requires a settings table.',
    })
  } catch (err) {
    return handleError(err)
  }
}
