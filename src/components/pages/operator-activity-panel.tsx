'use client'

import { useState } from 'react'
import { useOperatorActivity } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { LoadingSkeleton, ErrorState, EmptyState } from '@/components/shared/state-views'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Users, Activity, CheckCircle2, Clock, TrendingUp, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatUptime, timeAgo, titleCase } from '@/lib/format'

const RANGES = [
  { value: '24', label: '24h' },
  { value: '168', label: '7d' },
  { value: '720', label: '30d' },
]

/**
 * Operator activity panel — shows per-operator load + response times.
 * Helps coordinators balance work across the team.
 */
export function OperatorActivityPanel() {
  const [hours, setHours] = useState('168')
  const { data, isLoading, isError, refetch } = useOperatorActivity(Number(hours))
  const setView = useAppStore((s) => s.setView)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              Operator activity
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Per-operator load + response times for load balancing.
            </CardDescription>
          </div>
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="h-8 w-[80px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : isError ? (
          <ErrorState title="Could not load operator activity" onRetry={() => refetch()} className="py-6" />
        ) : !data || data.operators.length === 0 ? (
          <EmptyState title="No active operators" className="py-6" />
        ) : (
          <>
            {/* Summary */}
            <div className="mb-4 grid grid-cols-3 gap-2">
              <SummaryMetric
                icon={<Activity className="h-3.5 w-3.5" />}
                label="Active incidents"
                value={data.totals.active_incidents}
                tone="warning"
              />
              <SummaryMetric
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="Resolved"
                value={data.totals.resolved_incidents}
                tone="success"
              />
              <SummaryMetric
                icon={<Zap className="h-3.5 w-3.5" />}
                label="Total actions"
                value={data.totals.total_actions}
                tone="info"
              />
            </div>

            {/* Operator cards */}
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {data.operators.map((op) => {
                const load = op.stats.active_count
                const loadTone = load >= 5 ? 'danger' : load >= 2 ? 'warning' : 'success'
                return (
                  <div
                    key={op.id}
                    className={cn(
                      'rounded-md border p-3 transition-shadow hover:shadow-sm',
                      load >= 5 && 'border-danger/30 bg-danger/5',
                      load >= 2 && load < 5 && 'border-warning/30 bg-warning/5',
                      load < 2 && 'border-border',
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{op.display_name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          @{op.username} · {titleCase(op.role)}
                        </div>
                      </div>
                      <StatusBadge
                        tone={loadTone}
                        label={`${load} active`}
                        size="sm"
                        pulse={load >= 5}
                      />
                    </div>

                    {/* Stats grid */}
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-xs">
                      <StatCell label="Assigned" value={String(op.stats.assigned_total)} />
                      <StatCell label="Resolved" value={String(op.stats.resolved_count)} />
                      <StatCell
                        label="Avg ack"
                        value={op.stats.avg_ack_seconds != null ? formatUptime(op.stats.avg_ack_seconds) : '—'}
                      />
                      <StatCell
                        label="Avg resolve"
                        value={op.stats.avg_resolve_seconds != null ? formatUptime(op.stats.avg_resolve_seconds) : '—'}
                      />
                    </div>

                    {/* Active incidents */}
                    {op.active_incidents.length > 0 && (
                      <div className="mt-2.5 space-y-1">
                        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Active incidents
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {op.active_incidents.slice(0, 4).map((inc) => {
                            const priTone =
                              inc.priority === 'CRITICAL' ? 'danger' :
                              inc.priority === 'HIGH' ? 'warning' :
                              inc.priority === 'MEDIUM' ? 'info' : 'muted'
                            return (
                              <button
                                key={inc.id}
                                onClick={() => setView({ name: 'incident', incidentId: inc.id })}
                                className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] hover:bg-accent"
                                title={`${inc.id} — ${titleCase(inc.priority)} ${titleCase(inc.category)}`}
                              >
                                <span className={cn('h-1.5 w-1.5 rounded-full', {
                                  'bg-danger': priTone === 'danger',
                                  'bg-warning': priTone === 'warning',
                                  'bg-info': priTone === 'info',
                                  'bg-muted-foreground': priTone === 'muted',
                                })} />
                                {inc.id}
                              </button>
                            )
                          })}
                          {op.active_incidents.length > 4 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{op.active_incidents.length - 4}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action counts */}
                    {op.total_actions > 0 && (
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        <span>{op.total_actions} actions in window</span>
                        {op.action_counts.incident && <span>· {op.action_counts.incident} incident</span>}
                        {op.action_counts.node && <span>· {op.action_counts.node} node</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SummaryMetric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'success' | 'warning' | 'danger' | 'info' }) {
  return (
    <div className={cn('rounded-md border p-2 text-center', {
      'border-success/30 bg-success/5': tone === 'success',
      'border-warning/30 bg-warning/5': tone === 'warning',
      'border-danger/30 bg-danger/5': tone === 'danger',
      'border-info/30 bg-info/5': tone === 'info',
    })}>
      <div className={cn('inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider', {
        'text-success': tone === 'success',
        'text-warning-foreground': tone === 'warning',
        'text-danger': tone === 'danger',
        'text-info': tone === 'info',
      })}>
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded bg-muted/30 px-1.5 py-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
