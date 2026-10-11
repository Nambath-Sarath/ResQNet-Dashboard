'use client'

import { useState } from 'react'
import { useOperatorHeatmap } from '@/lib/hooks'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LoadingSkeleton, ErrorState, EmptyState } from '@/components/shared/state-views'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
]

/**
 * Operator activity heatmap — 7×24 grid (day-of-week × hour-of-day).
 * Helps coordinators spot coverage gaps and schedule shifts.
 */
export function OperatorHeatmap() {
  const [days, setDays] = useState('14')
  const [selectedOp, setSelectedOp] = useState<string>('all')
  const { data, isLoading, isError } = useOperatorHeatmap(Number(days))

  const matrix = (() => {
    if (!data) return null
    if (selectedOp === 'all') return data.matrix
    return data.by_operator[selectedOp] ?? null
  })()

  const max = data?.max ?? 1

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Activity heatmap
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Operator actions by day-of-week × hour-of-day (UTC).
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={selectedOp} onValueChange={setSelectedOp}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All operators</SelectItem>
                {data?.operators.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.display_name} ({o.total_actions})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-8 w-[90px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : isError ? (
          <ErrorState title="Could not load heatmap" className="py-6" />
        ) : !data || !matrix || data.total_actions === 0 ? (
          <EmptyState
            title="No activity in window"
            description="No operator actions recorded in the selected time range."
            icon={<Activity className="h-6 w-6" />}
            className="py-6"
          />
        ) : (
          <>
            {/* Heatmap grid */}
            <div className="overflow-x-auto scrollbar-thin">
              <div className="min-w-[640px]">
                {/* Hour labels (top) */}
                <div className="mb-1 flex">
                  <div className="w-10 shrink-0" />
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground">
                      {h % 3 === 0 ? `${h}` : ''}
                    </div>
                  ))}
                </div>
                {/* Rows */}
                {matrix.map((row, dow) => (
                  <div key={dow} className="mb-0.5 flex items-center">
                    <div className="w-10 shrink-0 pr-1 text-right text-[10px] font-medium text-muted-foreground">
                      {data.day_labels[dow]}
                    </div>
                    {row.map((count, hour) => {
                      const intensity = max > 0 ? count / max : 0
                      return (
                        <div
                          key={hour}
                          className="group relative flex-1"
                          title={`${data.day_labels[dow]} ${hour}:00 — ${count} action${count !== 1 ? 's' : ''}`}
                        >
                          <div
                            className={cn(
                              'm-0.5 flex h-6 items-center justify-center rounded-sm text-[9px] font-medium transition-all',
                              count === 0 && 'bg-muted/40',
                              count > 0 && intensity < 0.25 && 'bg-info/20 text-info',
                              count > 0 && intensity >= 0.25 && intensity < 0.5 && 'bg-info/40 text-info',
                              count > 0 && intensity >= 0.5 && intensity < 0.75 && 'bg-info/60 text-info-foreground',
                              count > 0 && intensity >= 0.75 && 'bg-info text-info-foreground',
                            )}
                          >
                            {count > 0 ? count : ''}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span>Less</span>
                <div className="h-3 w-3 rounded-sm bg-muted/40" />
                <div className="h-3 w-3 rounded-sm bg-info/20" />
                <div className="h-3 w-3 rounded-sm bg-info/40" />
                <div className="h-3 w-3 rounded-sm bg-info/60" />
                <div className="h-3 w-3 rounded-sm bg-info" />
                <span>More</span>
              </div>
              <span>
                {selectedOp === 'all'
                  ? `${data.total_actions} total actions across ${data.operators.length} operator(s)`
                  : `${data.operators.find((o) => o.id === selectedOp)?.total_actions ?? 0} actions`}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
