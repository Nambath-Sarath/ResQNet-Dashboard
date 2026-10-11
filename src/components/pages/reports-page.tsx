'use client'

import { useState } from 'react'
import { useIncidentReport, downloadIncidentCsv } from '@/lib/hooks'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingSkeleton, ErrorState, EmptyState, ForbiddenState } from '@/components/shared/state-views'
import { OperatorActivityPanel } from './operator-activity-panel'
import { OperatorHeatmap } from './operator-heatmap'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FileBarChart,
  Download,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Users,
  Loader2,
  FileJson,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime, formatUptime } from '@/lib/format'

const RANGES = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

export function ReportsPage() {
  const [days, setDays] = useState('7')
  const since = new Date(Date.now() - Number(days) * 24 * 3600_000).toISOString()
  const { data, isLoading, isError, refetch } = useIncidentReport(since)

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <FileBarChart className="h-5 w-5" /> Reports
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Incident totals by category, status, priority + acknowledgement/resolution durations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => downloadIncidentCsv(since)}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/v1/reports/incidents?since=${since}&format=json`, '_blank')}>
            <FileJson className="mr-1 h-4 w-4" /> JSON
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 p-2.5 text-xs text-muted-foreground">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
        <span>
          Reports cover incidents created since <span className="tabular-nums">{formatDateTime(since)}</span>.
          Exports respect role permissions; sensitive survivor data is omitted. Data gaps during offline periods are labelled in the source records.
        </span>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : isError ? (
        <ErrorState title="Could not load report" onRetry={() => refetch()} className="m-6" />
      ) : !data || data.summary.total === 0 ? (
        <EmptyState title="No incidents in range" description="Try a wider time range." icon={<FileBarChart className="h-6 w-6" />} className="py-12" />
      ) : (
        <>
          {/* Summary metrics */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard icon={<FileBarChart className="h-4 w-4" />} label="Total incidents" value={data.summary.total} tone="info" />
            <MetricCard icon={<Clock className="h-4 w-4" />} label="Avg ack time" value={formatUptime(data.summary.avg_ack_seconds ?? 0)} tone="warning" />
            <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Avg resolve time" value={formatUptime(data.summary.avg_resolve_seconds ?? 0)} tone="info" />
            <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Resolved" value={data.summary.by_status.RESOLVED ?? 0} tone="success" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Breakdown by category */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">By category</CardTitle>
                <CardDescription className="text-xs">Distribution of incident types.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(data.summary.by_category).map(([cat, count]) => {
                  const pct = (count / data.summary.total) * 100
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="capitalize">{cat.toLowerCase()}</span>
                        <span className="tabular-nums text-muted-foreground">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-info" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Breakdown by priority */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">By priority</CardTitle>
                <CardDescription className="text-xs">Severity distribution.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(data.summary.by_priority).map(([pri, count]) => {
                  const pct = (count / data.summary.total) * 100
                  const color = pri === 'CRITICAL' ? 'bg-danger' : pri === 'HIGH' ? 'bg-warning' : pri === 'MEDIUM' ? 'bg-info' : 'bg-muted-foreground'
                  return (
                    <div key={pri} className="space-y-1">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="capitalize">{pri.toLowerCase()}</span>
                        <span className="tabular-nums text-muted-foreground">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Breakdown by status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">By status</CardTitle>
                <CardDescription className="text-xs">Lifecycle state distribution.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(data.summary.by_status).map(([st, count]) => {
                  const pct = (count / data.summary.total) * 100
                  const color = st === 'RESOLVED' ? 'bg-success' : st === 'IN_PROGRESS' ? 'bg-info' : st === 'NEW' ? 'bg-danger' : 'bg-muted-foreground'
                  return (
                    <div key={st} className="space-y-1">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="capitalize">{st.toLowerCase().replace(/_/g, ' ')}</span>
                        <span className="tabular-nums text-muted-foreground">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Duration metrics */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Response durations</CardTitle>
                <CardDescription className="text-xs">Acknowledgement, assignment, resolution.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                <DurationRow label="Avg acknowledgement" value={data.summary.avg_ack_seconds} />
                <DurationRow label="Avg assignment" value={data.summary.avg_assign_seconds} />
                <DurationRow label="Avg resolution" value={data.summary.avg_resolve_seconds} />
                <DurationRow label="Min resolution" value={data.summary.min_resolve_seconds} />
                <DurationRow label="Max resolution" value={data.summary.max_resolve_seconds} />
              </CardContent>
            </Card>
          </div>

          {/* Operator activity */}
          <OperatorActivityPanel />

          {/* Operator heatmap */}
          <OperatorHeatmap />

          {/* Incident list */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Incident records ({data.incidents.length})</CardTitle>
              <CardDescription className="text-xs">Generated at {formatDateTime(data.summary.generated_at)}.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">ID</th>
                      <th className="px-3 py-2 text-left font-medium">Created</th>
                      <th className="px-3 py-2 text-left font-medium">Cat</th>
                      <th className="px-3 py-2 text-left font-medium">Pri</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Ack(s)</th>
                      <th className="px-3 py-2 text-right font-medium">Resolve(s)</th>
                      <th className="px-3 py-2 text-left font-medium">Assignee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.incidents.map((inc) => (
                      <tr key={inc.id} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2 font-mono font-semibold">{inc.id}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{formatDateTime(inc.created_at)}</td>
                        <td className="px-3 py-2 capitalize">{inc.category.toLowerCase()}</td>
                        <td className="px-3 py-2 capitalize">{inc.priority.toLowerCase()}</td>
                        <td className="px-3 py-2 capitalize">{inc.status.toLowerCase().replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{inc.ack_seconds ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{inc.resolve_seconds ?? '—'}</td>
                        <td className="px-3 py-2 truncate">{inc.assignee ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function MetricCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: 'success' | 'warning' | 'danger' | 'info' | 'muted' }) {
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
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold leading-none tabular-nums">{value}</div>
          <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function DurationRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value != null ? formatUptime(value) : '—'}</span>
    </div>
  )
}
