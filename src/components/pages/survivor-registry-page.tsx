'use client'

import { useState } from 'react'
import { useSurvivors } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from '@/components/shared/status-badge'
import { FreshnessLabel } from '@/components/shared/freshness-label'
import { LoadingSkeleton, EmptyState, ErrorState, ForbiddenState } from '@/components/shared/state-views'
import { SurvivorMergeBar } from './survivor-merge-bar'
import { Users, Search, ShieldOff, MapPin, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo, formatDateTime, formatCoord } from '@/lib/format'

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'rescued', label: 'Rescued' },
  { value: 'missing', label: 'Missing' },
]

export function SurvivorRegistryPage() {
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [showContact, setShowContact] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const { data, isLoading, isError, refetch } = useSurvivors({
    status: status !== 'all' ? status : undefined,
    q: q || undefined,
  })
  const user = useAppStore((s) => s.user)
  const canSeeContact = data?.can_see_contact ?? false

  const selectedSurvivors = (data?.survivors ?? []).filter((s) => selectedIds.includes(s.id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return [prev[1], id] // keep only last 2
      return [...prev, id]
    })
  }

  const clearSelection = () => setSelectedIds([])

  if (!canSeeContact && !isLoading) {
    // Viewers and node technicians cannot see contact info but can still see the registry
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search survivor ref or name…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
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
        {canSeeContact && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowContact((s) => !s)}
            title="Toggle contact visibility"
          >
            {showContact ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
            {showContact ? 'Hide' : 'Show'} contact
          </Button>
        )}
        {data && <FreshnessLabel timestamp={data.freshness?.last_updated_at} className="ml-auto" />}
      </div>

      {!canSeeContact && !isLoading && (
        <div className="flex items-center gap-2 rounded-md border border-info/30 bg-info/5 p-2.5 text-xs text-muted-foreground">
          <ShieldOff className="h-3.5 w-3.5 shrink-0 text-info" />
          <span>
            Your role ({user?.role.toLowerCase()}) cannot view contact details. Names and phone
            numbers are hidden per spec §6.4 data-minimization rules.
          </span>
        </div>
      )}

      {/* Survivor merge bar (shown when exactly 2 are selected) */}
      <SurvivorMergeBar
        selected={selectedSurvivors}
        onClear={clearSelection}
        onComplete={clearSelection}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-muted-foreground" />
            Survivor registry
            {data && (
              <span className="text-xs font-normal text-muted-foreground">· {data.total} records</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingSkeleton rows={6} />
          ) : isError ? (
            <ErrorState
              title="Could not load survivors"
              description="The gateway may be unreachable."
              onRetry={() => refetch()}
              className="m-6"
            />
          ) : !data || data.survivors.length === 0 ? (
            <EmptyState
              title="No survivors recorded"
              description="Survivor reports will appear here when SOS submissions include person-level data."
              icon={<Users className="h-6 w-6" />}
              className="py-12"
            />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2.5 text-center">
                      <span className="text-[9px] text-muted-foreground">merge</span>
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium">Reference</th>
                    <th className="px-3 py-2.5 text-left font-medium">Name</th>
                    <th className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Contact</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">Location</th>
                    <th className="px-3 py-2.5 text-left font-medium">First seen</th>
                    <th className="px-4 py-2.5 text-right font-medium">Last contact</th>
                  </tr>
                </thead>
                <tbody>
                  {data.survivors.map((s) => {
                    const tone =
                      s.status === 'active'
                        ? 'warning'
                        : s.status === 'rescued'
                          ? 'success'
                          : s.status === 'missing'
                            ? 'danger'
                            : 'muted'
                    return (
                      <tr
                        key={s.id}
                        className={cn(
                          'border-b border-border/60 transition-colors last:border-0 hover:bg-accent/50',
                          selectedIds.includes(s.id) && 'bg-primary/5',
                        )}
                      >
                        <td className="px-3 py-3 text-center">
                          <Checkbox
                            checked={selectedIds.includes(s.id)}
                            onCheckedChange={() => toggleSelect(s.id)}
                            aria-label={`Select ${s.temporary_ref} for merge`}
                            className="mx-auto"
                            disabled={s.status === 'closed'}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold">{s.temporary_ref}</span>
                        </td>
                        <td className="px-3 py-3">
                          {canSeeContact && showContact && s.display_name ? (
                            <span className="text-sm">{s.display_name}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="hidden px-3 py-3 sm:table-cell">
                          {canSeeContact && showContact && s.contact ? (
                            <span className="font-mono text-xs">{s.contact}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge tone={tone} label={s.status} size="sm" pulse={s.status === 'active'} />
                        </td>
                        <td className="hidden px-3 py-3 md:table-cell">
                          {s.location_lat != null ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {formatCoord(s.location_lat, s.location_lon).split(',')[0]}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">
                          {timeAgo(s.first_seen_at)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                          {timeAgo(s.last_seen_at)}
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
    </div>
  )
}
