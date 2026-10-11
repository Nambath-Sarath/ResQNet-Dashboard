'use client'

import { useResilienceStore } from '@/lib/resilience-store'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { WifiOff, RefreshCw, AlertTriangle, Database } from 'lucide-react'
import { useState, useEffect } from 'react'

/**
 * Persistent top banner shown when the gateway API is unreachable OR the
 * browser is offline. Spec §11.1: "Show that the API is unreachable and mark
 * displayed server data stale. Do not allow writes to appear successful while
 * the API is unavailable."
 */
export function OfflineBanner() {
  const online = useResilienceStore((s) => s.online)
  const apiReachable = useResilienceStore((s) => s.apiReachable)
  const consecutiveFailures = useResilienceStore((s) => s.consecutiveFailures)
  const lastOnlineAt = useResilienceStore((s) => s.lastOnlineAt)
  const queue = useResilienceStore((s) => s.queue)
  const qc = useQueryClient()
  const [retrying, setRetrying] = useState(false)

  const isOffline = !online || !apiReachable
  const pendingCount = queue.filter((q) => q.status === 'pending' || q.status === 'failed').length

  // Auto-hide when back online
  if (!isOffline && pendingCount === 0) return null

  const reason = !online ? 'Browser is offline' : !apiReachable ? 'Gateway API unreachable' : null

  const retry = async () => {
    setRetrying(true)
    try {
      const res = await fetch('/api/v1/health', { cache: 'no-store' })
      if (res.ok) {
        useResilienceStore.getState().setApiReachable(true)
        useResilienceStore.getState().recordSuccess()
        qc.invalidateQueries()
      } else {
        useResilienceStore.getState().recordFailure()
      }
    } catch {
      useResilienceStore.getState().recordFailure()
    }
    setRetrying(false)
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs',
        !online
          ? 'border-danger/40 bg-danger/15 text-danger'
          : !apiReachable
            ? 'border-danger/40 bg-danger/10 text-danger'
            : 'border-warning/40 bg-warning/10 text-warning-foreground',
      )}
    >
      <div className="flex items-center gap-2 font-semibold">
        <WifiOff className="h-3.5 w-3.5" />
        {reason ?? (pendingCount > 0 ? `${pendingCount} write(s) queued for replay` : null)}
      </div>
      {consecutiveFailures > 0 && (
        <span className="text-muted-foreground">
          {consecutiveFailures} consecutive probe failure(s)
        </span>
      )}
      {lastOnlineAt && (
        <span className="text-muted-foreground">
          last online {new Date(lastOnlineAt).toLocaleTimeString()}
        </span>
      )}
      {pendingCount > 0 && (
        <span className="inline-flex items-center gap-1 text-warning-foreground">
          <Database className="h-3 w-3" /> {pendingCount} pending write(s)
        </span>
      )}
      <button
        onClick={retry}
        disabled={retrying}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-current/30 px-2 py-0.5 font-medium transition-colors hover:bg-current/10 disabled:opacity-50"
      >
        <RefreshCw className={cn('h-3 w-3', retrying && 'animate-spin')} />
        {retrying ? 'Probing…' : 'Probe now'}
      </button>
    </div>
  )
}
