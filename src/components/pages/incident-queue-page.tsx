'use client'

import { useState } from 'react'
import { useIncidents, useOverview, useBatchIncidentAction, useOperators } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { FreshnessLabel } from '@/components/shared/freshness-label'
import { LoadingSkeleton, EmptyState, ErrorState } from '@/components/shared/state-views'
import { QuickIncidentComposer } from './quick-incident-composer'
import { FilterPresetsBar } from './filter-presets-bar'
import { BatchActionBar } from './batch-action-bar'
import {
  Siren,
  Search,
  ChevronRight,
  Clock,
  Users,
  ShieldCheck,
  MapPin,
  Filter,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  timeAgo,
  titleCase,
} from '@/lib/format'
import type { IncidentStatus, IncidentPriority } from '@/lib/types'

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'ACKNOWLEDGED', label: 'Ack' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
]
const PRIORITY_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
]

export function IncidentQueuePage() {
  const [status, setStatus] = useState('all')
  const [priority, setPriority] = useState('all')
  const [q, setQ] = useState('')
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const setView = useAppStore((s) => s.setView)
  const { data: overview } = useOverview()
  const { data, isLoading, isError, refetch } = useIncidents({
    status: status !== 'all' ? status : undefined,
    priority: priority !== 'all' ? priority : undefined,
    q: q || undefined,
  })

  const applyPreset = (filters: { status?: string; priority?: string; q?: string }) => {
    setStatus(filters.status ?? 'all')
    setPriority(filters.priority ?? 'all')
    setQ(filters.q ?? '')
  }

  const incidentIds = data?.incidents.map((i) => i.id) ?? []
  const visibleIds = new Set(incidentIds)
  const visibleSelected = new Set([...selected].filter((id) => visibleIds.has(id)))
  const allSelected = incidentIds.length > 0 && visibleSelected.size === incidentIds.length
  const someSelected = visibleSelected.size > 0 && !allSelected

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(incidentIds))
  }

  const clearSelection = () => setSelected(new Set())

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Saved filter presets */}
      <FilterPresetsBar
        type="incident"
        currentFilters={{ status, priority, q }}
        onApply={applyPreset}
        activePresetId={activePresetId}
        onActiveChange={setActivePresetId}
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setActivePresetId(null) }}
            placeholder="Search incident ID or description…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
          <Filter className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatus(f.value); setActivePresetId(null) }}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors',
                status === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-1 rounded-md border border-border bg-card p-0.5 sm:flex">
          {PRIORITY_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setPriority(f.value); setActivePresetId(null) }}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors',
                priority === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {overview && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              <FreshnessLabel timestamp={overview.freshness.last_updated_at} />
            </span>
          )}
          <QuickIncidentComposer />
        </div>
      </div>

      {/* Batch action bar (shown when incidents are selected) */}
      {visibleSelected.size > 0 && (
        <BatchActionBar
          selectedIds={Array.from(visibleSelected)}
          onClear={clearSelection}
          onComplete={clearSelection}
        />
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Siren className="h-4 w-4 text-muted-foreground" />
            Incident queue
            {data && (
              <span className="text-xs font-normal text-muted-foreground">
                · {data.total} {data.total === 1 ? 'incident' : 'incidents'}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingSkeleton rows={6} />
          ) : isError ? (
            <ErrorState
              title="Could not load incidents"
              description="The gateway may be unreachable."
              onRetry={() => refetch()}
              className="m-6"
            />
          ) : !data || data.incidents.length === 0 ? (
            <EmptyState
              title="No incidents match the filters"
              description="Try clearing filters or check back when survivors submit reports."
              icon={<Siren className="h-6 w-6" />}
              className="py-12"
            />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2.5 text-center">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all incidents"
                        className="mx-auto"
                      />
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium">ID</th>
                    <th className="px-3 py-2.5 text-left font-medium">Cat</th>
                    <th className="px-3 py-2.5 text-left font-medium">Priority</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="hidden px-3 py-2.5 text-left font-medium lg:table-cell">Description</th>
                    <th className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Source</th>
                    <th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">Assigned</th>
                    <th className="px-4 py-2.5 text-right font-medium">Created</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {data.incidents.map((inc) => {
                    const cat = CATEGORY_LABELS[inc.category] ?? {
                      label: inc.category,
                      short: '—',
                    }
                    const pri = PRIORITY_LABELS[inc.priority as IncidentPriority] ?? {
                      label: inc.priority,
                      tone: 'muted',
                    }
                    const st = STATUS_LABELS[inc.status as IncidentStatus] ?? {
                      label: inc.status,
                      tone: 'muted',
                    }
                    return (
                      <tr
                        key={inc.id}
                        onClick={(e) => {
                          // Don't navigate if the click was on the checkbox
                          if ((e.target as HTMLElement).closest('button, [role="checkbox"]')) return
                          setView({ name: 'incident', incidentId: inc.id })
                        }}
                        className={cn(
                          'cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/50',
                          selected.has(inc.id) && 'bg-primary/5',
                        )}
                      >
                        <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(inc.id)}
                            onCheckedChange={() => toggleSelect(inc.id)}
                            aria-label={`Select ${inc.id}`}
                            className="mx-auto"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold">{inc.id}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                            {cat.short}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge tone={pri.tone} label={pri.label} size="sm" />
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge tone={st.tone} label={st.label} size="sm" />
                        </td>
                        <td className="hidden max-w-xs px-3 py-3 lg:table-cell">
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {inc.description}
                          </p>
                        </td>
                        <td className="hidden px-3 py-3 sm:table-cell">
                          {inc.source_node ? (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {inc.source_node.id}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              {titleCase(inc.source_type)}
                            </span>
                          )}
                        </td>
                        <td className="hidden px-3 py-3 md:table-cell">
                          {inc.assigned_to ? (
                            <span className="text-xs">{inc.assigned_to.display_name}</span>
                          ) : (
                            <span className="text-xs text-warning-foreground">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                          {timeAgo(inc.created_at)}
                        </td>
                        <td className="pr-3">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card grid for unacknowledged / priority */}
      {data && data.incidents.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.incidents
            .filter((i) => i.status === 'NEW' || i.priority === 'CRITICAL')
            .slice(0, 6)
            .map((inc) => {
              const cat = CATEGORY_LABELS[inc.category] ?? { label: inc.category, short: '—' }
              const pri = PRIORITY_LABELS[inc.priority as IncidentPriority] ?? {
                label: inc.priority,
                tone: 'muted',
              }
              const st = STATUS_LABELS[inc.status as IncidentStatus] ?? {
                label: inc.status,
                tone: 'muted',
              }
              return (
                <Card
                  key={inc.id}
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-md',
                    inc.priority === 'CRITICAL' && 'border-danger/40',
                  )}
                  onClick={() => setView({ name: 'incident', incidentId: inc.id })}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{inc.id}</span>
                        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                          {cat.short}
                        </span>
                      </div>
                      <StatusBadge tone={pri.tone} label={pri.label} size="sm" />
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-foreground/90">
                      {inc.description}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <StatusBadge tone={st.tone} label={st.label} size="sm" />
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {timeAgo(inc.created_at)}
                      </span>
                      {inc.people_affected ? (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" /> {inc.people_affected}
                        </span>
                      ) : null}
                      {inc.assigned_to ? (
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" /> {inc.assigned_to.display_name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-warning-foreground">
                          Unassigned
                        </span>
                      )}
                      {inc.location_lat != null && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> GPS
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
        </div>
      )}
    </div>
  )
}
