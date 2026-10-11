'use client'

import { useAppStore } from '@/lib/store'
import { useOverview } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react'
import { FreshnessLabel } from '@/components/shared/freshness-label'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/** Sticky banner shown when the dashboard cannot reach the API or data is stale. */
export function ConnectionBanner() {
  const connection = useAppStore((s) => s.connection)
  const setConnection = useAppStore((s) => s.setConnection)
  const lastSyncAt = useAppStore((s) => s.lastSyncAt)
  const { isError, data: overview, refetch } = useOverview()
  const qc = useQueryClient()

  // If overview query errors with a 5xx or network failure, mark offline
  useEffect(() => {
    if (isError) {
      setConnection('offline')
    } else if (connection === 'offline') {
      setConnection('connected')
    }
  }, [isError, connection, setConnection])

  if (connection === 'connected' && !overview?.freshness.stale) {
    return null
  }

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-4 py-2 text-xs',
        connection === 'offline'
          ? 'border-danger/30 bg-danger/10 text-danger'
          : 'border-warning/30 bg-warning/10 text-warning-foreground',
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        {connection === 'offline' ? (
          <>
            <WifiOff className="h-4 w-4" />
            Gateway unreachable
          </>
        ) : (
          <>
            <AlertTriangle className="h-4 w-4" />
            Data may be stale
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {connection === 'offline' ? (
          <span>Retrying automatically…</span>
        ) : (
          <FreshnessLabel timestamp={lastSyncAt} label="Last sync" />
        )}
      </div>
      <button
        onClick={() => {
          qc.invalidateQueries()
          refetch()
        }}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-current/30 px-2 py-0.5 font-medium transition-colors hover:bg-current/10"
      >
        <RefreshCw className="h-3 w-3" />
        Reconnect now
      </button>
    </div>
  )
}
