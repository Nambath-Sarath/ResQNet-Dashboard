'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Radio, Activity, Users, Bell, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime, timeAgo, titleCase } from '@/lib/format'
import type { RealtimeEvent } from '@/lib/use-realtime'
import { useAppStore } from '@/lib/store'

type RTState = {
  status: string
  recentEvents: RealtimeEvent[]
  operatorsOnline: { id: string; name: string; role: string; socket_count: number }[]
}

/**
 * Floating bell button (bottom-right) that opens a drawer showing the live
 * socket.io event stream + connected operators. The unread badge count
 * increases as new events arrive until the drawer is opened.
 */
export function RealtimeEventFeedButton() {
  const [open, setOpen] = useState(false)
  const [rt, setRt] = useState<RTState>({ status: 'connecting', recentEvents: [], operatorsOnline: [] })
  const [seenCount, setSeenCount] = useState(0)
  const setView = useAppStore((s) => s.setView)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as RTState
      setRt(detail)
    }
    window.addEventListener('resqnet:rt', handler)
    return () => window.removeEventListener('resqnet:rt', handler)
  }, [])

  const unread = Math.max(0, rt.recentEvents.length - seenCount)
  const displayUnread = open ? 0 : unread

  // When opening the drawer, mark all current events as seen (no effect needed).
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) setSeenCount(rt.recentEvents.length)
  }

  const statusTone =
    rt.status === 'connected' ? 'success' : rt.status === 'reconnecting' ? 'warning' : 'danger'
  const statusLabel =
    rt.status === 'connected'
      ? 'Live'
      : rt.status === 'reconnecting'
        ? 'Reconnecting'
        : 'Offline'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card shadow-lg transition-all hover:scale-105 hover:shadow-xl"
        aria-label="Open realtime event feed"
      >
        <Bell className="h-5 w-5 text-foreground" />
        {displayUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-danger-foreground">
            {displayUnread > 99 ? '99+' : displayUnread}
          </span>
        )}
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card',
            statusTone === 'success' && 'bg-success animate-pulse-dot',
            statusTone === 'warning' && 'bg-warning',
            statusTone === 'danger' && 'bg-danger',
          )}
          title={statusLabel}
        />
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full sm:w-[420px] p-0">
          <SheetHeader className="space-y-1 border-b px-4 py-3">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Live event feed
              </SheetTitle>
              <Badge
                variant="outline"
                className={cn(
                  'gap-1',
                  statusTone === 'success' && 'border-success/40 text-success',
                  statusTone === 'warning' && 'border-warning/40 text-warning-foreground',
                  statusTone === 'danger' && 'border-danger/40 text-danger',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    statusTone === 'success' && 'bg-success animate-pulse-dot',
                    statusTone === 'warning' && 'bg-warning',
                    statusTone === 'danger' && 'bg-danger',
                  )}
                />
                {statusLabel}
              </Badge>
            </div>
            <SheetDescription className="text-xs">
              socket.io realtime stream · {rt.recentEvents.length} event(s) in buffer
            </SheetDescription>
          </SheetHeader>

          {/* Operators online */}
          <div className="border-b px-4 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Users className="h-3 w-3" />
              Operators online ({rt.operatorsOnline.length})
            </div>
            {rt.operatorsOnline.length === 0 ? (
              <p className="text-xs text-muted-foreground">No other operators connected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {rt.operatorsOnline.map((op) => (
                  <span
                    key={op.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" />
                    {op.name}
                    <span className="text-muted-foreground">· {titleCase(op.role)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Event list */}
          <ScrollArea className="h-[calc(100vh-9rem)] scrollbar-thin">
            {rt.recentEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <Radio className="h-8 w-8 text-muted-foreground/50" />
                <p>Waiting for live events…</p>
                <p className="text-[11px]">
                  Incident lifecycle changes, node heartbeats and displacement alerts will appear here in real time.
                </p>
              </div>
            ) : (
              <ol className="divide-y divide-border">
                {rt.recentEvents.map((env) => (
                  <EventRow key={env.event_id} env={env} onOpen={() => {
                    if (env.entity_id && env.event_type.startsWith('incident')) {
                      setView({ name: 'incident', incidentId: env.entity_id })
                      handleOpenChange(false)
                    } else if (env.entity_id && env.event_type.startsWith('node')) {
                      setView({ name: 'node', nodeId: env.entity_id })
                      handleOpenChange(false)
                    }
                  }} />
                ))}
              </ol>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}

function EventRow({ env, onOpen }: { env: RealtimeEvent; onOpen: () => void }) {
  const [domain] = env.event_type.split('.')
  const isImportant =
    env.event_type === 'incident.created' ||
    env.event_type === 'incident.resolved' ||
    env.event_type === 'node.displacement_warning'

  const tone =
    domain === 'incident'
      ? isImportant
        ? 'text-danger bg-danger/10'
        : 'text-info bg-info/10'
      : domain === 'node'
        ? env.event_type.includes('displacement')
          ? 'text-danger bg-danger/10'
          : 'text-success bg-success/10'
        : 'text-muted-foreground bg-muted'

  return (
    <li>
      <button
        onClick={env.entity_id ? onOpen : undefined}
        disabled={!env.entity_id}
        className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-accent/50 disabled:cursor-default"
      >
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            tone,
          )}
        >
          {domain === 'incident' ? <Bell className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium">
              {titleCase(env.event_type.replace(/[._]/g, ' '))}
            </span>
            {env.entity_id && (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </div>
          {env.entity_id && (
            <div className="font-mono text-[10px] text-muted-foreground">{env.entity_id}</div>
          )}
          <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
            {timeAgo(env.occurred_at)} · {formatDateTime(env.occurred_at)}
          </div>
        </div>
      </button>
    </li>
  )
}
