'use client'

import { cn } from '@/lib/utils'
import { Battery, BatteryLow, BatteryWarning, BatteryFull, PlugZap } from 'lucide-react'
import { batteryStatus } from '@/lib/format'
import { StatusBadge } from './status-badge'

/** Battery percentage with icon + color tone. */
export function BatteryIndicator({
  pct,
  showLabel = true,
  className,
}: {
  pct: number | null | undefined
  showLabel?: boolean
  className?: string
}) {
  const status = batteryStatus(pct)
  const Icon =
    pct == null
      ? PlugZap
      : pct <= 15
        ? BatteryLow
        : pct <= 35
          ? BatteryWarning
          : pct >= 90
            ? BatteryFull
            : Battery
  return (
    <StatusBadge
      tone={status.tone}
      icon={<Icon className="h-3 w-3" />}
      label={pct == null ? 'Unknown' : `${Math.round(pct)}%`}
      size="sm"
      className={className}
      pulse={pct != null && pct <= 15}
    />
  )
}

/** Link-quality bar (0..100). */
export function LinkQualityBar({
  quality,
  className,
}: {
  quality: number | null | undefined
  className?: string
}) {
  const v = quality ?? 0
  const tone =
    v >= 70 ? 'bg-success' : v >= 40 ? 'bg-warning' : v > 0 ? 'bg-danger' : 'bg-muted-foreground/40'
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', tone)}
          style={{ width: `${Math.min(100, v)}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {v > 0 ? `${Math.round(v)}%` : '—'}
      </span>
    </div>
  )
}
