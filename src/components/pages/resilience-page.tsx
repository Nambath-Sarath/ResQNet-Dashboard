'use client'

import { useState } from 'react'
import { useResilienceStore } from '@/lib/resilience-store'
import {
  useBackups,
  useCreateBackup,
  useTestRestore,
  useDeleteBackup,
  useClockDrift,
  useFieldTestChecklist,
  useRecordFieldTest,
  useNodes,
  useNodeQueue,
  useReplayNodeQueue,
} from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/shared/status-badge'
import { LoadingSkeleton, EmptyState, ErrorState } from '@/components/shared/state-views'
import {
  ShieldCheck,
  Wifi,
  WifiOff,
  Database,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  HardDrive,
  Server,
  Activity,
  ListChecks,
  Radio,
  Send,
  RotateCcw,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime, formatUptime, timeAgo, titleCase } from '@/lib/format'
import { toast } from 'sonner'
import { ApiRequestError } from '@/lib/api-client'

export function ResiliencePage() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <ShieldCheck className="h-5 w-5" /> Resilience
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Offline-mode, write-queue, clock-drift, backup/restore, and field-test checklist (spec §11 + §16.4).
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="queue">Write queue</TabsTrigger>
          <TabsTrigger value="nodes">Node queue</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="field-test">Field test</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="queue" className="space-y-4">
          <WriteQueueTab />
        </TabsContent>
        <TabsContent value="nodes" className="space-y-4">
          <NodeQueueTab />
        </TabsContent>
        <TabsContent value="backup" className="space-y-4">
          <BackupTab />
        </TabsContent>
        <TabsContent value="field-test" className="space-y-4">
          <FieldTestTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// --- Overview tab: network + clock drift ------------------------------------

function OverviewTab() {
  const { online, apiReachable, consecutiveFailures, lastOnlineAt, lastOfflineAt } = useResilienceStore()
  const { data: clock, isLoading: clockLoading, isError: clockError } = useClockDrift()

  return (
    <>
      {/* Network status cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <NetCard
          icon={online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          label="Browser"
          value={online ? 'Online' : 'Offline'}
          tone={online ? 'success' : 'danger'}
          pulse={!online}
        />
        <NetCard
          icon={apiReachable ? <Server className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          label="Gateway API"
          value={apiReachable ? 'Reachable' : 'Unreachable'}
          tone={apiReachable ? 'success' : 'danger'}
          pulse={!apiReachable}
        />
        <NetCard
          icon={<Activity className="h-4 w-4" />}
          label="Consecutive failures"
          value={String(consecutiveFailures)}
          tone={consecutiveFailures > 0 ? 'warning' : 'success'}
        />
        <NetCard
          icon={<Clock className="h-4 w-4" />}
          label="Last online"
          value={lastOnlineAt ? timeAgo(lastOnlineAt) : '—'}
          tone="muted"
        />
      </div>

      {/* Resilience rules explanation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Offline-mode behaviour
          </CardTitle>
          <CardDescription className="text-xs">Spec §11.1 — what happens when the API is unreachable.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <RuleRow ok label="Writes queued locally — never appear successful while offline" />
          <RuleRow ok label="Server data marked stale with age + 'Data may be stale' label" />
          <RuleRow ok label="Reconnect with bounded backoff (1s → 15s, jitter 0.4)" />
          <RuleRow ok label="Replay queue with idempotency keys on reconnect" />
          <RuleRow ok label="Refetch authoritative records after reconnect (full cache invalidation)" />
          <RuleRow ok label="Browser online/offline events tracked separately from API reachability" />
        </CardContent>
      </Card>

      {/* Clock drift */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" /> Clock-drift indicators
          </CardTitle>
          <CardDescription className="text-xs">Spec §11.4 — device clocks may drift offline.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {clockLoading ? (
            <LoadingSkeleton rows={4} />
          ) : clockError ? (
            <ErrorState title="Could not load clock data" className="m-4" />
          ) : !clock ? (
            <EmptyState title="No clock data" className="py-6" />
          ) : (
            <>
              <div className="flex items-center justify-between border-b px-4 py-2.5 text-xs">
                <span className="text-muted-foreground">Gateway time</span>
                <span className="tabular-nums">{formatDateTime(clock.gateway_time)}</span>
              </div>
              <div className="flex items-center justify-between border-b px-4 py-2.5 text-xs">
                <span className="text-muted-foreground">Clock source</span>
                <span className="font-mono">{clock.gateway_clock_source}</span>
              </div>
              <div className="flex items-center justify-between border-b px-4 py-2.5 text-xs">
                <span className="text-muted-foreground">Synchronized nodes</span>
                <span className="font-semibold tabular-nums">
                  {clock.summary.synchronized}/{clock.summary.total}
                </span>
              </div>
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/40 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Node</th>
                    <th className="px-3 py-2 text-left font-medium">Drift</th>
                    <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Reported</th>
                    <th className="px-3 py-2 text-center font-medium">Uncertainty</th>
                  </tr>
                </thead>
                <tbody>
                  {clock.nodes.map((n) => {
                    const tone =
                      n.uncertainty === 'ok' ? 'success' :
                      n.uncertainty === 'warning' ? 'warning' :
                      n.uncertainty === 'critical' ? 'danger' : 'muted'
                    return (
                      <tr key={n.node_id} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-medium">{n.display_name}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{n.node_id}</div>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{n.drift_label}</td>
                        <td className="hidden px-3 py-2 tabular-nums text-muted-foreground sm:table-cell">
                          {n.has_heartbeat ? timeAgo(n.node_reported_at) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <StatusBadge tone={tone} label={titleCase(n.uncertainty)} size="sm" pulse={n.uncertainty === 'critical'} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      {lastOfflineAt && (
        <div className="text-[10px] text-muted-foreground">
          Last went offline: {formatDateTime(lastOfflineAt)}
        </div>
      )}
    </>
  )
}

// --- Write queue tab --------------------------------------------------------

function WriteQueueTab() {
  const queue = useResilienceStore((s) => s.queue)
  const clearSucceeded = useResilienceStore((s) => s.clearSucceeded)
  const retry = useResilienceStore((s) => s.retry)
  const remove = useResilienceStore((s) => s.remove)

  const pending = queue.filter((q) => q.status === 'pending' || q.status === 'failed')
  const inFlight = queue.filter((q) => q.status === 'in_flight')
  const succeeded = queue.filter((q) => q.status === 'succeeded')

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium">Write queue</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {pending.length} pending · {inFlight.length} in-flight · {succeeded.length} done
          </span>
        </div>
        {succeeded.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => { clearSucceeded(); toast.success('Cleared succeeded.') }}>
            <Trash2 className="mr-1 h-3 w-3" /> Clear done
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {queue.length === 0 ? (
            <EmptyState
              title="Queue is empty"
              description="Writes created while the API is unreachable will appear here and auto-replay on reconnect."
              icon={<Database className="h-6 w-6" />}
              className="py-12"
            />
          ) : (
            <ul className="divide-y divide-border">
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
                  <li key={q.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', {
                        'text-success': tone === 'success',
                        'text-danger': tone === 'danger',
                        'text-info': tone === 'info',
                        'text-warning-foreground': tone === 'warning',
                        'animate-spin': q.status === 'in_flight',
                      })} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{q.description}</span>
                          <span className={cn('rounded px-1 py-0 text-[9px] font-bold uppercase', {
                            'bg-success/15 text-success': tone === 'success',
                            'bg-danger/15 text-danger': tone === 'danger',
                            'bg-info/15 text-info': tone === 'info',
                            'bg-warning/15 text-warning-foreground': tone === 'warning',
                          })}>
                            {q.status.replace('_', '-')}
                          </span>
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {q.endpoint} · {q.method} · idempotency: {q.client_submission_id}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          queued {timeAgo(q.created_at)} · {q.attempts} attempt(s)
                        </div>
                        {q.last_error && (
                          <div className="mt-1 rounded bg-danger/10 px-2 py-1 text-[10px] text-danger">
                            {q.last_error}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {q.status === 'failed' && (
                          <Button variant="ghost" size="sm" onClick={() => { retry(q.id); toast.info('Retrying…') }}>
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                        {(q.status === 'succeeded' || q.status === 'failed') && (
                          <Button variant="ghost" size="sm" onClick={() => remove(q.id)}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// --- Node queue tab (simulator) ---------------------------------------------

function NodeQueueTab() {
  const { data: nodesData } = useNodes()
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  const { data: queueData, isLoading, isError, refetch } = useNodeQueue(selectedNode)
  const replay = useReplayNodeQueue()

  const handleReplay = (mode: 'replay' | 'expire') => {
    if (!selectedNode) return
    replay.mutate(
      { nodeId: selectedNode, mode },
      {
        onSuccess: (r) => {
          if (mode === 'replay') {
            toast.success(
              `Replay complete: ${r.forwarded ?? 0} forwarded, ${r.duplicates ?? 0} duplicate(s) discarded.`,
              { description: r.note },
            )
          } else {
            toast.success(`Expired ${r.expired ?? 0} queued message(s).`)
          }
        },
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Failed'),
      },
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Radio className="h-4 w-4 text-muted-foreground" /> Node queue simulator
          </CardTitle>
          <CardDescription className="text-xs">
            Spec §11.2 — simulate a node reconnecting and forwarding its local queue. Duplicates are discarded idempotently.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="mb-1.5 block text-xs font-medium">Select a node</label>
          <select
            value={selectedNode ?? ''}
            onChange={(e) => setSelectedNode(e.target.value || null)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">— Select —</option>
            {nodesData?.nodes.map((n) => (
              <option key={n.id} value={n.id}>{n.display_name} ({n.id})</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {selectedNode && (
        <>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleReplay('replay')} disabled={replay.isPending || !queueData || queueData.queue_size === 0}>
              {replay.isPending ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Replaying…</> : <><Send className="mr-1 h-3.5 w-3.5" /> Simulate reconnect + forward</>}
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleReplay('expire')} disabled={replay.isPending || !queueData || queueData.queue_size === 0}>
              <XCircle className="mr-1 h-3.5 w-3.5" /> Expire all queued
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>Queue for {selectedNode}</span>
                {queueData && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {queueData.queue_size}/{queueData.queue_limit}
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-xs">{queueData?.overflow_policy ?? 'drop_oldest'} on overflow</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <LoadingSkeleton rows={4} />
              ) : isError ? (
                <ErrorState title="Could not load queue" onRetry={() => refetch()} className="m-4" />
              ) : !queueData || queueData.queued.length === 0 ? (
                <EmptyState
                  title="Queue is empty"
                  description="No messages are currently queued for this node. Compose a message targeted at this node to see it here."
                  icon={<Database className="h-6 w-6" />}
                  className="py-8"
                />
              ) : (
                <ul className="divide-y divide-border">
                  {queueData.queued.map((m) => (
                    <li key={m.id} className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <StatusBadge tone="warning" label={m.status.replace(/_/g, ' ')} size="sm" />
                        <span className="font-mono text-[10px] text-muted-foreground">{m.source} → {m.destination}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{timeAgo(m.created_at)}</span>
                      </div>
                      <p className="mt-1 text-xs text-foreground/90">{m.body}</p>
                      {m.expires_at && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">expires {formatDateTime(m.expires_at)}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {queueData && queueData.expired_count > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Expired messages ({queueData.expired_count})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {queueData.expired.slice(0, 5).map((m) => (
                    <li key={m.id} className="px-4 py-2 text-xs text-muted-foreground">
                      <span className="font-mono">{m.source} → {m.destination}</span>: {m.body.slice(0, 60)}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  )
}

// --- Backup tab -------------------------------------------------------------

function BackupTab() {
  const { data, isLoading, isError, refetch } = useBackups()
  const create = useCreateBackup()
  const test = useTestRestore()
  const del = useDeleteBackup()
  const user = useAppStore((s) => s.user)
  const isAdmin = user?.role === 'ADMINISTRATOR'

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium">Backup inventory</span>
          {data && <span className="ml-2 text-xs text-muted-foreground">· {data.total} backup(s)</span>}
        </div>
        <Button size="sm" onClick={() => create.mutate(undefined, { onSuccess: () => toast.success('Backup created.'), onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Failed') })} disabled={!isAdmin || create.isPending}>
          {create.isPending ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Backing up…</> : <><Download className="mr-1 h-3.5 w-3.5" /> Create backup</>}
        </Button>
      </div>

      {!isAdmin && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Only administrators can create or delete backups.</span>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 p-2.5 text-xs text-muted-foreground">
        <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
        <span>
          Spec §9.2: "Back up to a separate storage location when possible, not only to the same SD card."
          Backups are stored at <code className="font-mono">{data?.backup_dir ?? '/tmp/resqnet-backups'}</code> for this prototype.
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingSkeleton rows={4} />
          ) : isError ? (
            <ErrorState title="Could not load backups" onRetry={() => refetch()} className="m-4" />
          ) : !data || data.backups.length === 0 ? (
            <EmptyState title="No backups yet" description="Create a backup to see it here." icon={<Database className="h-6 w-6" />} className="py-12" />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Backup</th>
                  <th className="px-3 py-2 text-right font-medium">Size</th>
                  <th className="px-3 py-2 text-right font-medium">Created</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.backups.map((b) => (
                  <tr key={b.id} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{b.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{(b.size / 1024).toFixed(1)} KB</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">{timeAgo(b.created_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => test.mutate(b.id, { onSuccess: () => toast.success('Backup verified: file exists, is non-empty, and is readable.'), onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Failed') })} disabled={test.isPending} title="Test restore (verify readability)">
                          <Upload className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => del.mutate(b.id, { onSuccess: () => toast.success('Backup deleted.'), onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Failed') })} disabled={!isAdmin} title="Delete">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning-foreground" /> Restore-test requirement
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Spec §9.2: "Test restoring a backup; creating backups without testing restoration is insufficient."
          The "Test restore" action verifies the backup file exists, is non-empty, and is readable. A full restore
          to a separate Pi is still required before production use.
        </CardContent>
      </Card>
    </>
  )
}

// --- Field-test tab ---------------------------------------------------------

function FieldTestTab() {
  const { data, isLoading, isError, refetch } = useFieldTestChecklist()
  const record = useRecordFieldTest()
  const [filter, setFilter] = useState<'all' | 'pending' | 'pass' | 'fail'>('all')

  const items = data?.items ?? []
  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter)

  const sections = Array.from(new Set(filtered.map((i) => i.section)))

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">Field-test checklist</span>
          {data && (
            <span className="ml-2 text-xs text-muted-foreground">
              · {data.summary.passed}/{data.summary.total} passed · {data.summary.failed} failed · {data.summary.pending} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
          {(['all', 'pending', 'pass', 'fail'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn('rounded px-2 py-1 text-xs font-medium transition-colors', filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {f === 'all' ? 'All' : titleCase(f)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Spec §16.4: "Do not market the system as rescue-ready based only on UI or simulator tests.
          Real field deployment requires supervised hardware testing and an operational safety plan."
        </span>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : isError ? (
        <ErrorState title="Could not load checklist" onRetry={() => refetch()} className="m-6" />
      ) : (
        sections.map((section) => (
          <Card key={section}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                {section} tests
                <span className="text-xs font-normal text-muted-foreground">
                  · {filtered.filter((i) => i.section === section).length} item(s)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {filtered.filter((i) => i.section === section).map((item) => {
                  const tone =
                    item.status === 'pass' ? 'success' :
                    item.status === 'fail' ? 'danger' :
                    item.status === 'skip' ? 'muted' : 'warning'
                  const sevTone =
                    item.severity === 'critical' ? 'danger' :
                    item.severity === 'high' ? 'warning' : 'muted'
                  return (
                    <li key={item.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', {
                          'bg-success/15 text-success': tone === 'success',
                          'bg-danger/15 text-danger': tone === 'danger',
                          'bg-muted text-muted-foreground': tone === 'muted',
                          'bg-warning/15 text-warning-foreground': tone === 'warning',
                        })}>
                          {item.status === 'pass' ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                           item.status === 'fail' ? <XCircle className="h-3.5 w-3.5" /> :
                           item.status === 'skip' ? <X className="h-3.5 w-3.5" /> :
                           <Clock className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-foreground/90">{item.text}</span>
                            <StatusBadge tone={sevTone} label={item.severity} size="sm" />
                            <span className="font-mono text-[10px] text-muted-foreground">{item.id}</span>
                          </div>
                          {item.note && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>
                          )}
                          {item.recorded_at && (
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              recorded {timeAgo(item.recorded_at)}
                            </div>
                          )}
                          <div className="mt-2 flex gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 border-success/40 text-success hover:bg-success/10"
                              disabled={record.isPending}
                              onClick={() => record.mutate({ checklistId: item.id, status: 'pass' }, { onSuccess: () => toast.success('Marked as passed.') })}
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Pass
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 border-danger/40 text-danger hover:bg-danger/10"
                              disabled={record.isPending}
                              onClick={() => record.mutate({ checklistId: item.id, status: 'fail' }, { onSuccess: () => toast.error('Marked as failed.') })}
                            >
                              <XCircle className="mr-1 h-3 w-3" /> Fail
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7"
                              disabled={record.isPending}
                              onClick={() => record.mutate({ checklistId: item.id, status: 'skip' }, { onSuccess: () => toast.info('Marked as skipped.') })}
                            >
                              Skip
                            </Button>
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </>
  )
}

// --- shared bits -------------------------------------------------------------

function NetCard({ icon, label, value, tone, pulse }: {
  icon: React.ReactNode
  label: string
  value: string
  tone: 'success' | 'warning' | 'danger' | 'info' | 'muted'
  pulse?: boolean
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3.5">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', {
          'bg-success/10 text-success': tone === 'success',
          'bg-warning/15 text-warning-foreground': tone === 'warning',
          'bg-danger/10 text-danger': tone === 'danger',
          'bg-info/10 text-info': tone === 'info',
          'bg-muted text-muted-foreground': tone === 'muted',
        })}>
          <span className={pulse ? 'animate-pulse' : ''}>{icon}</span>
        </div>
        <div>
          <div className="text-sm font-semibold leading-none">{value}</div>
          <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function RuleRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className={cn('h-3.5 w-3.5 shrink-0', ok ? 'text-success' : 'text-muted-foreground')} />
      <span className={ok ? 'text-foreground/90' : 'text-muted-foreground line-through'}>{label}</span>
    </div>
  )
}
