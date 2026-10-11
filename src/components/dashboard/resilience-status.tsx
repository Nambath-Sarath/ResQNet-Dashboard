'use client'

import { useResilienceStore } from '@/lib/resilience-store'
import { useAppStore } from '@/lib/store'
import { useOverview } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  RotateCcw,
  Inbox,
  X,
  Loader2,
  Plus,
} from 'lucide-react'
import { timeAgo } from '@/lib/format'
import { toast } from 'sonner'
import { useState } from 'react'

const KIND_LABELS: Record<string, string> = {
  incident: 'Incident',
  message: 'Message',
  resource: 'Resource',
  shelter: 'Shelter',
  note: 'Note',
  other: 'Write',
}

/**
 * Compact connection-status pill shown in the topbar area. Clicking it opens
 * the full resilience panel (offline write-queue + health details).
 */
export function ResilienceStatusPill() {
  const online = useResilienceStore((s) => s.online)
  const apiReachable = useResilienceStore((s) => s.apiReachable)
  const queue = useResilienceStore((s) => s.queue)
  const [open, setOpen] = useState(false)

  const pendingCount = queue.filter((q) => q.status === 'pending' || q.status === 'failed').length

  // Determine the display state
  let tone: 'success' | 'warning' | 'danger'
  let label: string
  let Icon: typeof Wifi
  let pulse = false

  if (!online) {
    tone = 'danger'
    label = 'Offline'
    Icon = WifiOff
  } else if (!apiReachable) {
    tone = 'danger'
    label = 'API unreachable'
    Icon = WifiOff
    pulse = true
  } else if (pendingCount > 0) {
    tone = 'warning'
    label = `${pendingCount} queued`
    Icon = AlertTriangle
    pulse = true
  } else {
    tone = 'success'
    label = 'Online'
    Icon = Wifi
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
          tone === 'success' && 'border-success/30 bg-success/10 text-success',
          tone === 'warning' && 'border-warning/30 bg-warning/15 text-warning-foreground',
          tone === 'danger' && 'border-danger/30 bg-danger/10 text-danger',
        )}
        title="Network & queue status"
      >
        <Icon className={cn('h-3 w-3', pulse && 'animate-pulse')} />
        <span className="hidden sm:inline">{label}</span>
        {pendingCount > 0 && (
          <span className="ml-0.5 rounded-full bg-danger px-1 text-[9px] font-bold text-danger-foreground">
            {pendingCount}
          </span>
        )}
      </button>

      <ResiliencePanel open={open} onOpenChange={setOpen} />
    </>
  )
}

function ResiliencePanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { online, apiReachable, lastOnlineAt, lastOfflineAt, consecutiveFailures, queue } = useResilienceStore()
  const clearSucceeded = useResilienceStore((s) => s.clearSucceeded)
  const retry = useResilienceStore((s) => s.retry)
  const remove = useResilienceStore((s) => s.remove)
  const { data: overview } = useOverview()

  const pending = queue.filter((q) => q.status === 'pending' || q.status === 'failed')
  const inFlight = queue.filter((q) => q.status === 'in_flight')
  const succeeded = queue.filter((q) => q.status === 'succeeded')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[440px] p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Wifi className="h-4 w-4 text-muted-foreground" />
            Network & write-queue
          </SheetTitle>
          <SheetDescription className="text-xs">
            Resilience status · {queue.length} queued write(s) · spec §11.1 offline-mode
          </SheetDescription>
        </SheetHeader>

        {/* Status cards */}
        <div className="grid grid-cols-2 gap-2 p-4">
          <StatusCard
            label="Browser"
            value={online ? 'Online' : 'Offline'}
            tone={online ? 'success' : 'danger'}
            icon={online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          />
          <StatusCard
            label="Gateway API"
            value={apiReachable ? 'Reachable' : 'Unreachable'}
            tone={apiReachable ? 'success' : 'danger'}
            icon={apiReachable ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            pulse={!apiReachable}
          />
          <StatusCard
            label="Consecutive failures"
            value={String(consecutiveFailures)}
            tone={consecutiveFailures > 0 ? 'warning' : 'success'}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
          />
          <StatusCard
            label="Last online"
            value={lastOnlineAt ? timeAgo(lastOnlineAt) : '—'}
            tone="muted"
            icon={<Clock className="h-3.5 w-3.5" />}
          />
        </div>

        {/* Gateway health */}
        {overview && (
          <div className="mx-4 mb-3 rounded-md border border-border bg-muted/30 p-2.5 text-xs">
            <div className="mb-1 font-medium">Gateway snapshot</div>
            <div className="grid grid-cols-2 gap-1 text-muted-foreground">
              <span>API: {overview.gateway_health.api_status}</span>
              <span>DB: {overview.gateway_health.database_status}</span>
              <span>Uptime: {Math.floor(overview.gateway_health.uptime_seconds / 60)}m</span>
              <span>Last backup: {overview.gateway_health.last_backup_at ? timeAgo(overview.gateway_health.last_backup_at) : 'never'}</span>
            </div>
          </div>
        )}

        {/* Queue summary */}
        <div className="flex items-center justify-between border-y px-4 py-2.5">
          <div className="text-sm font-medium">
            Write queue
            <span className="ml-2 text-xs text-muted-foreground">
              {pending.length} pending · {inFlight.length} in-flight · {succeeded.length} done
            </span>
          </div>
          {succeeded.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { clearSucceeded(); toast.success('Cleared succeeded entries.') }}>
              <Trash2 className="mr-1 h-3 w-3" /> Clear done
            </Button>
          )}
        </div>

        {/* Queue list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2" style={{ maxHeight: 'calc(100vh - 22rem)' }}>
          {queue.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <Inbox className="h-8 w-8 text-muted-foreground/50" />
              <p>Queue is empty</p>
              <p className="text-[11px]">
                Writes created while the API is unreachable will appear here and auto-replay on reconnect.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {queue.map((q) => {
                const tone =
                  q.status === 'succeeded' ? 'success' :
                  q.status === 'failed' ? 'danger' :
                  q.status === 'in_flight' ? 'info' : 'warning'
                const Icon =
                  q.status === 'succeeded' ? CheckCircle2 :
                  q.status === 'failed' ? AlertTriangle :
                  q.status === 'in_flight' ? Loader2 : Clock
                return (
                  <li key={q.id} className="rounded-md border border-border bg-card p-2.5">
                    <div className="flex items-start gap-2">
                      <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', {
                        'text-success': tone === 'success',
                        'text-danger': tone === 'danger',
                        'text-info': tone === 'info',
                        'text-warning-foreground': tone === 'warning',
                        'animate-spin': q.status === 'in_flight',
                      })} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">{KIND_LABELS[q.kind] ?? 'Write'}</span>
                          <span className={cn('rounded px-1 py-0 text-[9px] font-bold uppercase', {
                            'bg-success/15 text-success': tone === 'success',
                            'bg-danger/15 text-danger': tone === 'danger',
                            'bg-info/15 text-info': tone === 'info',
                            'bg-warning/15 text-warning-foreground': tone === 'warning',
                          })}>
                            {q.status.replace('_', '-')}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-foreground/90">{q.description}</p>
                        <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                          {q.client_submission_id}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          queued {timeAgo(q.created_at)} · {q.attempts} attempt(s)
                        </div>
                        {q.last_error && (
                          <div className="mt-0.5 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">
                            {q.last_error}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        {q.status === 'failed' && (
                          <button
                            onClick={() => { retry(q.id); toast.info('Retrying…') }}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Retry"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </button>
                        )}
                        {(q.status === 'succeeded' || q.status === 'failed') && (
                          <button
                            onClick={() => remove(q.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Dismiss"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {lastOfflineAt && (
          <div className="border-t px-4 py-2 text-[10px] text-muted-foreground">
            Last went offline: {timeAgo(lastOfflineAt)}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function StatusCard({ label, value, tone, icon, pulse }: {
  label: string
  value: string
  tone: 'success' | 'warning' | 'danger' | 'info' | 'muted'
  icon: React.ReactNode
  pulse?: boolean
}) {
  return (
    <div className={cn('rounded-md border p-2.5', {
      'border-success/30 bg-success/5': tone === 'success',
      'border-warning/30 bg-warning/5': tone === 'warning',
      'border-danger/30 bg-danger/5': tone === 'danger',
      'border-info/30 bg-info/5': tone === 'info',
      'border-border bg-muted/30': tone === 'muted',
    })}>
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className={pulse && 'animate-pulse'}>{icon}</span>
        {label}
      </div>
      <div className={cn('mt-1 text-sm font-semibold', {
        'text-success': tone === 'success',
        'text-warning-foreground': tone === 'warning',
        'text-danger': tone === 'danger',
        'text-info': tone === 'info',
      })}>
        {value}
      </div>
    </div>
  )
}
