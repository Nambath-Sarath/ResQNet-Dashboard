'use client'

import { useIncidentDuplicates } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { LoadingSkeleton, EmptyState } from '@/components/shared/state-views'
import { Copy, ChevronRight, MapPin, Clock, Radio, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PRIORITY_LABELS, STATUS_LABELS, timeAgo, titleCase } from '@/lib/format'

type Props = { incidentId: string }

/**
 * Duplicate-detection card for the incident detail page.
 * Surfaces possible duplicate incidents with a confidence score + reasons.
 * Spec §6.3: "Related/possible duplicate incident IDs."
 */
export function DuplicateDetectionCard({ incidentId }: Props) {
  const { data, isLoading } = useIncidentDuplicates(incidentId)
  const setView = useAppStore((s) => s.setView)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Copy className="h-4 w-4 text-muted-foreground" />
          Possible duplicates
          {data && data.total > 0 && (
            <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning-foreground">
              {data.total}
            </span>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Heuristic detection: same category + time proximity + location + keyword overlap.
          Confidence is a score (0-100), not a definitive match.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : !data || data.duplicates.length === 0 ? (
          <EmptyState
            title="No likely duplicates"
            description="No other incidents in the same category within the time window have a similar location or description."
            icon={<Copy className="h-6 w-6" />}
            className="py-6"
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.duplicates.map((dup) => {
              const pri = PRIORITY_LABELS[dup.priority as keyof typeof PRIORITY_LABELS] ?? { label: dup.priority, tone: 'muted' }
              const st = STATUS_LABELS[dup.status as keyof typeof STATUS_LABELS] ?? { label: dup.status, tone: 'muted' }
              const confTone = dup.confidence >= 70 ? 'danger' : dup.confidence >= 50 ? 'warning' : 'muted'
              return (
                <li key={dup.incident_id}>
                  <button
                    onClick={() => setView({ name: 'incident', incidentId: dup.incident_id })}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                  >
                    {/* Confidence gauge */}
                    <div className="flex flex-col items-center gap-0.5">
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold',
                          confTone === 'danger' && 'bg-danger/15 text-danger',
                          confTone === 'warning' && 'bg-warning/15 text-warning-foreground',
                          confTone === 'muted' && 'bg-muted text-muted-foreground',
                        )}
                      >
                        {dup.confidence}
                      </div>
                      <span className="text-[9px] text-muted-foreground">confidence</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold">{dup.incident_id}</span>
                        <StatusBadge tone={pri.tone} label={pri.label} size="sm" />
                        <StatusBadge tone={st.tone} label={st.label} size="sm" />
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-foreground/90">{dup.description}</p>

                      {/* Reasons */}
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {dup.reasons.map((r, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                          >
                            {r.includes('apart') && r.includes('m') && !r.includes('km') ? <Clock className="h-2 w-2" /> : null}
                            {r.includes('apart') && r.includes('m') && r.includes('km') ? <MapPin className="h-2 w-2" /> : null}
                            {r.includes('source node') ? <Radio className="h-2 w-2" /> : null}
                            {r.includes('keyword') ? <Copy className="h-2 w-2" /> : null}
                            {r}
                          </span>
                        ))}
                      </div>

                      {/* Metadata */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" /> {dup.time_diff_minutes}m apart
                        </span>
                        {dup.distance_km != null && (
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5" /> {Math.round(dup.distance_km * 1000)}m
                          </span>
                        )}
                        {dup.source_node_id && (
                          <span className="inline-flex items-center gap-0.5">
                            <Radio className="h-2.5 w-2.5" /> {dup.source_node_id}
                          </span>
                        )}
                        {dup.assignee && <span>· assigned: {dup.assignee}</span>}
                        <span>· created {timeAgo(dup.created_at)}</span>
                      </div>
                    </div>

                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {data && data.total > 0 && (
          <div className="flex items-start gap-2 border-t px-4 py-2.5 text-[10px] text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning-foreground" />
            <span>
              {data.note} Operators must confirm before merging — the confidence score is a heuristic
              based on category, time, location, source node, and keyword overlap.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
