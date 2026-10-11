'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Battery, Wifi, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/format'
import type { NodeHeartbeat } from '@/lib/types'

type Props = {
  heartbeats: NodeHeartbeat[]
}

/**
 * SVG line chart showing a node's battery + link-quality trend over time.
 * Uses the heartbeat history (already fetched by NodeDetailPage).
 * Helps technicians spot degrading trends before failure.
 */
export function NodeHealthChart({ heartbeats }: Props) {
  // Reverse to chronological order (seed stores newest-first)
  const chronological = useMemo(() => [...heartbeats].reverse(), [heartbeats])

  if (chronological.length < 2) {
    return null
  }

  const W = 600
  const H = 160
  const padding = { top: 10, right: 10, bottom: 25, left: 30 }
  const plotW = W - padding.left - padding.right
  const plotH = H - padding.top - padding.bottom

  // X scale: time index → x pixel
  const n = chronological.length
  const xScale = (i: number) => padding.left + (i / (n - 1)) * plotW

  // Y scale: 0..100 → y pixel (inverted)
  const yScale = (v: number) => padding.top + plotH - (v / 100) * plotH

  // Build line paths
  const batteryPath = chronological
    .map((hb, i) => {
      const v = hb.battery ?? 0
      return `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`
    })
    .join(' ')

  const linkPath = chronological
    .map((hb, i) => {
      const v = hb.link_quality ?? 0
      return `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`
    })
    .join(' ')

  // Latest values
  const latest = chronological[chronological.length - 1]
  const latestBattery = latest.battery
  const latestLink = latest.link_quality

  // Trend detection (compare first half avg vs second half avg)
  const half = Math.floor(n / 2)
  const firstHalfBattery = chronological.slice(0, half).reduce((s, h) => s + (h.battery ?? 0), 0) / half
  const secondHalfBattery = chronological.slice(half).reduce((s, h) => s + (h.battery ?? 0), 0) / (n - half)
  const batteryTrend = secondHalfBattery - firstHalfBattery

  const firstHalfLink = chronological.slice(0, half).reduce((s, h) => s + (h.link_quality ?? 0), 0) / half
  const secondHalfLink = chronological.slice(half).reduce((s, h) => s + (h.link_quality ?? 0), 0) / (n - half)
  const linkTrend = secondHalfLink - firstHalfLink

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            Health trend
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {n} readings · last {timeAgo(latest.received_at)}
          </span>
        </CardTitle>
        <CardDescription className="text-xs">
          Battery + link quality over time. Spot degrading trends before failure.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
          {/* Chart */}
          <div className="overflow-x-auto scrollbar-thin">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full min-w-[400px]" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="battGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--success)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--success)" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="linkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--info)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--info)" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Y-axis grid lines + labels (0, 50, 100) */}
              {[0, 25, 50, 75, 100].map((v) => (
                <g key={v}>
                  <line
                    x1={padding.left}
                    y1={yScale(v)}
                    x2={W - padding.right}
                    y2={yScale(v)}
                    stroke="var(--border)"
                    strokeWidth="0.5"
                    strokeDasharray="2,2"
                  />
                  <text
                    x={padding.left - 4}
                    y={yScale(v) + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="var(--muted-foreground)"
                  >
                    {v}
                  </text>
                </g>
              ))}

              {/* Battery area + line */}
              <path
                d={`${batteryPath} L ${xScale(n - 1).toFixed(1)},${yScale(0).toFixed(1)} L ${xScale(0).toFixed(1)},${yScale(0).toFixed(1)} Z`}
                fill="url(#battGrad)"
              />
              <path
                d={batteryPath}
                fill="none"
                stroke="var(--success)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Link line */}
              <path
                d={linkPath}
                fill="none"
                stroke="var(--info)"
                strokeWidth="2"
                strokeDasharray="4,2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Data points */}
              {chronological.map((hb, i) => (
                <g key={hb.id}>
                  <circle
                    cx={xScale(i)}
                    cy={yScale(hb.battery ?? 0)}
                    r="2.5"
                    fill="var(--success)"
                  />
                  <circle
                    cx={xScale(i)}
                    cy={yScale(hb.link_quality ?? 0)}
                    r="2"
                    fill="var(--info)"
                  />
                </g>
              ))}

              {/* X-axis labels (first + last) */}
              <text
                x={padding.left}
                y={H - 5}
                fontSize="9"
                fill="var(--muted-foreground)"
              >
                {timeAgo(chronological[0].received_at)}
              </text>
              <text
                x={W - padding.right}
                y={H - 5}
                fontSize="9"
                fill="var(--muted-foreground)"
                textAnchor="end"
              >
                {timeAgo(chronological[n - 1].received_at)}
              </text>
            </svg>
          </div>

          {/* Legend + latest values */}
          <div className="space-y-2 text-xs">
            <div className="rounded-md border border-border p-2">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <Battery className="h-3 w-3 text-success" />
                <span>Battery</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold tabular-nums text-success">
                  {latestBattery != null ? `${Math.round(latestBattery)}%` : '—'}
                </span>
                {batteryTrend !== 0 && (
                  <span className={cn(
                    'text-[10px] font-medium',
                    batteryTrend < -5 ? 'text-danger' : batteryTrend < 0 ? 'text-warning-foreground' : 'text-success',
                  )}>
                    {batteryTrend > 0 ? '+' : ''}{batteryTrend.toFixed(1)}/h
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-md border border-border p-2">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <Wifi className="h-3 w-3 text-info" />
                <span>Link quality</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold tabular-nums text-info">
                  {latestLink != null ? `${Math.round(latestLink)}%` : '—'}
                </span>
                {linkTrend !== 0 && (
                  <span className={cn(
                    'text-[10px] font-medium',
                    linkTrend < -5 ? 'text-danger' : linkTrend < 0 ? 'text-warning-foreground' : 'text-success',
                  )}>
                    {linkTrend > 0 ? '+' : ''}{linkTrend.toFixed(1)}/h
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-0.5 w-4 bg-success" /> battery
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-0.5 w-4 border-t border-dashed border-info" /> link
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
