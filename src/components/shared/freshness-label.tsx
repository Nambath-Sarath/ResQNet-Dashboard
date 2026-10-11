'use client'

import { cn } from '@/lib/utils'
import { staleness } from '@/lib/format'
import { Clock, AlertTriangle } from 'lucide-react'

/** Renders "Updated 2m ago" with a stale warning when the data is old. */
export function FreshnessLabel({
  timestamp,
  staleAfterMs = 5 * 60_000,
  className,
  label = 'Updated',
}: {
  timestamp: string | null | undefined
  staleAfterMs?: number
  className?: string
  label?: string
}) {
  const s = staleness(timestamp, staleAfterMs)
  if (s.stale) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium text-warning-foreground',
          className,
        )}
        title={timestamp ? new Date(timestamp).toLocaleString() : 'No data received yet'}
      >
        <AlertTriangle className="h-3 w-3" />
        Stale · last seen {s.label}
      </span>
    )
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}
      title={timestamp ? new Date(timestamp).toLocaleString() : 'No data received yet'}
    >
      <Clock className="h-3 w-3" />
      {label} {s.label}
    </span>
  )
}
