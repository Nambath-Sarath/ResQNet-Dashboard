'use client'

import { useState } from 'react'
import { useAuditLogs } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FilterPresetsBar } from './filter-presets-bar'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { LoadingSkeleton, EmptyState, ErrorState, ForbiddenState } from '@/components/shared/state-views'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ShieldAlert, Search, Download, User, Database, Radio, Siren, Lock, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime, timeAgo, titleCase } from '@/lib/format'

const ENTITY_TYPES = ['all', 'operator', 'node', 'incident', 'message', 'resource', 'shelter', 'settings', 'resource_request']

export function AuditLogPage() {
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('all')
  const [actorId, setActorId] = useState('')
  const [q, setQ] = useState('')
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const { data, isLoading, isError, refetch } = useAuditLogs({
    action: action || undefined,
    entity_type: entityType !== 'all' ? entityType : undefined,
    actor_id: actorId || undefined,
  })
  const user = useAppStore((s) => s.user)

  if (data && !['ADMINISTRATOR', 'DISPATCHER'].includes(data.viewer.role)) {
    return <ForbiddenState className="m-6" />
  }

  const applyPreset = (filters: { action?: string; entity_type?: string; actor_id?: string; q?: string }) => {
    setAction(filters.action ?? '')
    setEntityType(filters.entity_type ?? 'all')
    setActorId(filters.actor_id ?? '')
    setQ(filters.q ?? '')
  }

  let filtered = data?.logs ?? []
  if (q) {
    filtered = filtered.filter(
      (l) => l.action.toLowerCase().includes(q.toLowerCase()) || (l.metadata ?? '').toLowerCase().includes(q.toLowerCase()),
    )
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Saved filter presets */}
      <FilterPresetsBar
        type="audit"
        currentFilters={{ action, entity_type: entityType, actor_id: actorId, q }}
        onApply={applyPreset}
        activePresetId={activePresetId}
        onActiveChange={setActivePresetId}
      />

      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <ShieldAlert className="h-5 w-5" /> Audit log
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Restricted history of operator actions and sensitive reads. Viewer: {data?.viewer.role}.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.open('/api/v1/audit-logs?format=json', '_blank')}>
          <Download className="mr-1 h-4 w-4" /> Export JSON
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search action or metadata…"
            className="pl-9"
          />
        </div>
        <Input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="action filter (e.g. incident.acknowledge)"
          className="h-9 w-[200px] text-xs"
        />
        <Input
          value={actorId}
          onChange={(e) => setActorId(e.target.value)}
          placeholder="actor_id"
          className="h-9 w-[160px] font-mono text-xs"
        />
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t === 'all' ? 'All entities' : titleCase(t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            Audit entries
            {data && <span className="text-xs font-normal text-muted-foreground">· {data.total}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingSkeleton rows={8} />
          ) : isError ? (
            <ErrorState title="Could not load audit log" onRetry={() => refetch()} className="m-6" />
          ) : filtered.length === 0 ? (
            <EmptyState title="No audit entries" description="No entries match the filters." icon={<ShieldAlert className="h-6 w-6" />} className="py-12" />
          ) : (
            <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
              <ol className="relative">
                {filtered.map((l, i) => {
                  const [domain] = l.action.split('.')
                  const Icon = getActionIcon(l.action)
                  const tone =
                    l.action.includes('create') || l.action.includes('register') ? 'success' :
                    l.action.includes('delete') || l.action.includes('cancel') || l.action.includes('revoke') ? 'danger' :
                    l.action.includes('update') || l.action.includes('lock') || l.action.includes('assign') ? 'info' :
                    'muted'
                  return (
                    <li key={l.id} className="relative flex gap-3 border-b border-border/40 px-4 py-2.5 last:border-0">
                      <div className="flex flex-col items-center">
                        <div className={cn('flex h-7 w-7 items-center justify-center rounded-full', {
                          'bg-success/10 text-success': tone === 'success',
                          'bg-danger/10 text-danger': tone === 'danger',
                          'bg-info/10 text-info': tone === 'info',
                          'bg-muted text-muted-foreground': tone === 'muted',
                        })}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        {i < filtered.length - 1 && <div className="mt-0.5 w-px flex-1 bg-border" />}
                      </div>
                      <div className="min-w-0 flex-1 pb-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-medium">{l.action}</span>
                          {l.entity_type && (
                            <StatusBadge tone="muted" label={l.entity_type} size="sm" />
                          )}
                          {l.entity_id && (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {l.entity_id.length > 12 ? l.entity_id.slice(-12) : l.entity_id}
                            </span>
                          )}
                        </div>
                        {l.metadata && l.metadata !== '{}' && (
                          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground break-all">
                            {formatMetadata(l.metadata)}
                          </p>
                        )}
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="inline-flex items-center gap-0.5">
                            <User className="h-2.5 w-2.5" />
                            {l.actor_type}
                            {l.actor_id ? `:${l.actor_id.slice(-6)}` : ''}
                          </span>
                          <span>·</span>
                          <span className="tabular-nums">{formatDateTime(l.timestamp)}</span>
                          <span className="text-muted-foreground/60">({timeAgo(l.timestamp)})</span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function getActionIcon(action: string) {
  if (action.startsWith('incident')) return Siren
  if (action.startsWith('node')) return Radio
  if (action.startsWith('operator')) return User
  if (action.startsWith('auth')) return Lock
  if (action.startsWith('resource')) return Database
  if (action.startsWith('message')) return Siren
  if (action.startsWith('settings')) return Settings2
  if (action.startsWith('shelter')) return Database
  return ShieldAlert
}

function formatMetadata(json: string): string {
  try {
    const o = JSON.parse(json)
    return JSON.stringify(o).slice(0, 200)
  } catch {
    return json.slice(0, 200)
  }
}
