// Formatting helpers for the ResQNet dashboard.

/** Compact relative time: "just now", "3m ago", "2h ago", "3d ago", "2026-10-11 04:10". */
export function timeAgo(input: string | Date | null | undefined): string {
  if (!input) return '—'
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  if (diff < 0) return 'just now'
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Full date/time for detail views: "2026-10-11 04:10 UTC". */
export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return '—'
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return '—'
  return (
    d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  )
}

/** Seconds → "2d 3h 4m" compact uptime. */
export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/** Number with thousands separators. */
export function formatNum(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString()
}

/** 17.6868, 83.2185 → "17.6868° N, 83.2185° E". */
export function formatCoord(lat: number | null | undefined, lon: number | null | undefined): string {
  if (lat == null || lon == null) return 'Unavailable'
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`
}

/** Convert minutes-of-age to a "staleness" bucket used by FreshnessLabel. */
export function staleness(
  lastUpdated: string | null | undefined,
  staleAfterMs = 5 * 60_000,
): { stale: boolean; ageMs: number; label: string } {
  if (!lastUpdated) {
    return { stale: true, ageMs: Number.POSITIVE_INFINITY, label: 'never' }
  }
  const t = new Date(lastUpdated).getTime()
  const age = Date.now() - t
  return {
    stale: age > staleAfterMs,
    ageMs: age,
    label: timeAgo(lastUpdated),
  }
}

/** Battery percentage → color token + label. */
export function batteryStatus(pct: number | null | undefined): {
  tone: 'success' | 'warning' | 'danger' | 'muted'
  label: string
} {
  if (pct == null) return { tone: 'muted', label: 'Unknown' }
  if (pct <= 15) return { tone: 'danger', label: 'Critical' }
  if (pct <= 35) return { tone: 'warning', label: 'Low' }
  if (pct <= 70) return { tone: 'success', label: 'Adequate' }
  return { tone: 'success', label: 'Full' }
}

/** RSSI dBm → quality label. */
export function rssiQuality(rssi: number | null | undefined): {
  tone: 'success' | 'warning' | 'danger' | 'muted'
  label: string
} {
  if (!rssi || rssi === 0) return { tone: 'muted', label: 'No signal' }
  if (rssi >= -60) return { tone: 'success', label: 'Excellent' }
  if (rssi >= -75) return { tone: 'success', label: 'Good' }
  if (rssi >= -85) return { tone: 'warning', label: 'Fair' }
  return { tone: 'danger', label: 'Weak' }
}

/** Title-case a snake/SCREAMING string. */
export function titleCase(s: string | null | undefined): string {
  if (!s) return '—'
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export const CATEGORY_LABELS: Record<string, { label: string; short: string }> = {
  RESCUE: { label: 'Rescue', short: 'RSC' },
  MEDICAL: { label: 'Medical', short: 'MED' },
  FIRE: { label: 'Fire', short: 'FIR' },
  FLOOD: { label: 'Flood', short: 'FLD' },
  STRUCTURE: { label: 'Structure', short: 'STR' },
  SUPPLY: { label: 'Supply', short: 'SPL' },
  COMMUNICATION: { label: 'Communication', short: 'COM' },
  OTHER: { label: 'Other', short: 'OTH' },
}

export const PRIORITY_LABELS: Record<string, { label: string; tone: 'danger' | 'warning' | 'info' | 'muted' }> = {
  CRITICAL: { label: 'Critical', tone: 'danger' },
  HIGH: { label: 'High', tone: 'warning' },
  MEDIUM: { label: 'Medium', tone: 'info' },
  LOW: { label: 'Low', tone: 'muted' },
}

export const STATUS_LABELS: Record<string, { label: string; tone: 'danger' | 'warning' | 'info' | 'success' | 'muted' }> = {
  NEW: { label: 'New', tone: 'danger' },
  ACKNOWLEDGED: { label: 'Acknowledged', tone: 'warning' },
  ASSIGNED: { label: 'Assigned', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'muted' },
  DUPLICATE: { label: 'Duplicate', tone: 'muted' },
}

export const RUNTIME_STATE_LABELS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' }> = {
  online: { label: 'Online', tone: 'success' },
  stale: { label: 'Stale', tone: 'warning' },
  offline: { label: 'Offline', tone: 'muted' },
  fault: { label: 'Fault', tone: 'danger' },
}

export const LIFECYCLE_LABELS: Record<string, string> = {
  REGISTERED: 'Registered',
  DEPLOYED: 'Deployed',
  MAINTENANCE: 'Maintenance',
  RETIRED: 'Retired',
}

export const MODULE_STATUS_LABELS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' }> = {
  PRESENT_ONLINE: { label: 'Online', tone: 'success' },
  PRESENT_DEGRADED: { label: 'Degraded', tone: 'warning' },
  PRESENT_OFFLINE: { label: 'Offline', tone: 'danger' },
  NOT_DETECTED: { label: 'Not detected', tone: 'muted' },
  UNKNOWN: { label: 'Unknown', tone: 'muted' },
}
