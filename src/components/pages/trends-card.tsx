'use client'

import { useTrends } from '@/lib/hooks'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LoadingSkeleton, ErrorState, EmptyState } from '@/components/shared/state-views'
import { TrendingUp, AlertTriangle, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Mini trends chart for the Overview page.
 * Shows incident volume per hour over the last 24h as a bar chart,
 * with critical incidents highlighted.
 */
export function TrendsCard({ hours = 24 }: { hours?: number }) {
  const { data, isLoading, isError } = useTrends(hours)

  if (isLoading) return <LoadingSkeleton rows={2} />
  if (isError) return <ErrorState title="Could not load trends" className="m-4" />
  if (!data) return <EmptyState title="No trend data" className="py-6" />

  const maxCount = Math.max(1, ...data.incidents.map((b) => b.count))
  const peak = data.summary.peak_per_hour
  const avg = data.summary.avg_per_hour

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Incident volume — last {hours}h
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {data.summary.total_incidents} total · peak {peak}/h · avg {avg.toFixed(1)}/h
          </span>
        </CardTitle>
        <CardDescription className="text-xs">
          Hourly incident creations. Critical incidents shown in red.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Bar chart */}
        <div className="relative h-32">
          <svg viewBox={`0 0 ${data.incidents.length * 8} 100`} className="h-full w-full" preserveAspectRatio="none">
            {/* Stacked bars for each hour */}
            <line
              x1="0"
              y1="100"
              x2={data.incidents.length * 8}
              y2="100"
              stroke="var(--border)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            {data.incidents.map((b, i) => {
              const h = (b.count / maxCount) * 100
              const critH = (b.critical / maxCount) * 100
              const regularH = Math.max(0, h - critH)
              return (
                <g key={i}>
                  <rect
                    x={i * 8 + 1}
                    y={100 - regularH - critH}
                    width={6}
                    height={regularH}
                    fill="var(--info)"
                    opacity={0.6}
                    rx={1}
                  />
                  {b.critical > 0 && (
                    <rect
                      x={i * 8 + 1}
                      y={100 - critH}
                      width={6}
                      height={critH}
                      fill="var(--danger)"
                      rx={1}
                    />
                  )}
                </g>
              )
            })}
          </svg>
          {/* Peak label */}
          {peak > 0 && (
            <div className="absolute right-0 top-0 flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
              <AlertTriangle className="h-2.5 w-2.5 text-danger" />
              peak {peak}
            </div>
          )}
        </div>
        {/* Legend + heartbeat trend */}
        <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-info" /> incidents
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-danger" /> critical
            </span>
          </div>
          <span className="inline-flex items-center gap-1">
            <Activity className="h-2.5 w-2.5" />
            {data.heartbeats.reduce((s, h) => s + h.heartbeats, 0)} heartbeats in window
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
