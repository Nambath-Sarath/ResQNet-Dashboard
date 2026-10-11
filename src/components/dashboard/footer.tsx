'use client'

import { useOverview } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { formatDateTime, formatUptime } from '@/lib/format'
import { Database, HardDrive, Clock } from 'lucide-react'

export function Footer() {
  const { data: overview } = useOverview()
  const connection = useAppStore((s) => s.connection)

  return (
    <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-foreground/80">ResQNet</span>
        <span className="text-muted-foreground/60">·</span>
        <span>Command Dashboard v0.1.0</span>
      </div>
      {overview && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span className="inline-flex items-center gap-1">
            <Database className="h-3 w-3" />
            {overview.gateway_health.database_status === 'connected' ? 'SQLite connected' : 'DB unreachable'}
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="inline-flex items-center gap-1">
            <HardDrive className="h-3 w-3" />
            Uptime {formatUptime(overview.gateway_health.uptime_seconds)}
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Server {formatDateTime(overview.gateway_health.server_time)}
          </span>
          {overview.gateway_health.last_backup_at && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>Last backup {formatDateTime(overview.gateway_health.last_backup_at)}</span>
            </>
          )}
        </>
      )}
      <span className="ml-auto inline-flex items-center gap-1.5">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            connection === 'connected' ? 'bg-success animate-pulse-dot' : 'bg-danger'
          }`}
        />
        {connection === 'connected' ? 'Realtime link active' : 'Offline mode'}
      </span>
    </footer>
  )
}
