'use client'

import { useState, useMemo } from 'react'
import { useMapData } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { StatusBadge } from '@/components/shared/status-badge'
import { FreshnessLabel } from '@/components/shared/freshness-label'
import { LoadingSkeleton, ErrorState, EmptyState } from '@/components/shared/state-views'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import {
  Map as MapIcon,
  Radio,
  Siren,
  Users,
  Home,
  Satellite,
  AlertTriangle,
  WifiOff,
  Layers,
  Crosshair,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  RUNTIME_STATE_LABELS,
  titleCase,
  timeAgo,
  formatCoord,
} from '@/lib/format'
import type { MapMarker } from './leaflet-map'

// Leaflet accesses window; load only on the client.
const LeafletMap = dynamic(() => import('./leaflet-map').then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
})

type LayerKey = 'nodes' | 'incidents' | 'survivors' | 'shelters'

export function SituationMapPage() {
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    nodes: true,
    incidents: true,
    survivors: true,
    shelters: true,
  })
  const [selected, setSelected] = useState<MapMarker | null>(null)
  const [offlineTiles, setOfflineTiles] = useState(false) // simulation toggle
  const setView = useAppStore((s) => s.setView)
  const layerStr = Object.keys(layers).filter((k) => layers[k as LayerKey]).join(',')
  const { data, isLoading, isError, refetch } = useMapData(layerStr)

  const markers = useMemo<MapMarker[]>(() => {
    if (!data) return []
    const out: MapMarker[] = []
    if (layers.nodes && data.nodes) {
      for (const n of data.nodes) {
        const state = RUNTIME_STATE_LABELS[n.runtime_state] ?? { label: 'Unknown', tone: 'muted' }
        // Deployment reference marker (square)
        if (n.deployment_lat != null && n.deployment_lon != null) {
          out.push({
            id: `node-dep-${n.id}`,
            lat: n.deployment_lat,
            lng: n.deployment_lon,
            kind: 'node',
            label: n.display_name,
            tone: state.tone,
            popup: `<strong>${n.display_name}</strong> (${n.id})<br/>Deployment reference<br/>${formatCoord(n.deployment_lat, n.deployment_lon)}<br/>${state.label} · battery ${n.battery != null ? Math.round(n.battery) + '%' : '—'}`,
          })
        }
        // Live GPS marker (circle), only if different from deployment
        if (n.live_lat != null && n.live_lon != null) {
          const same = n.deployment_lat != null && n.deployment_lon != null &&
            Math.abs(n.live_lat - n.deployment_lat!) < 0.0001 &&
            Math.abs(n.live_lon - n.deployment_lon!) < 0.0001
          if (!same) {
            out.push({
              id: `node-live-${n.id}`,
              lat: n.live_lat,
              lng: n.live_lon,
              kind: 'node_live',
              label: `${n.display_name} (live)`,
              tone: n.online ? 'success' : 'muted',
              popup: `<strong>${n.display_name}</strong> live GPS<br/>${formatCoord(n.live_lat, n.live_lon)}<br/>captured ${timeAgo(n.live_captured_at)}`,
            })
          }
        }
      }
    }
    if (layers.incidents && data.incidents) {
      for (const inc of data.incidents) {
        const pri = PRIORITY_LABELS[inc.priority as keyof typeof PRIORITY_LABELS] ?? { label: inc.priority, tone: 'muted' }
        out.push({
          id: `inc-${inc.id}`,
          lat: inc.location_lat,
          lng: inc.location_lon,
          kind: 'incident',
          label: inc.id,
          tone: pri.tone,
          popup: `<strong>${inc.id}</strong> · ${titleCase(inc.category)} · ${pri.label}<br/>${inc.description.slice(0, 100)}<br/>${inc.people_affected ?? 0} affected · ${timeAgo(inc.created_at)}`,
        })
      }
    }
    if (layers.survivors && data.survivors) {
      for (const s of data.survivors) {
        out.push({
          id: `surv-${s.id}`,
          lat: s.location_lat,
          lng: s.location_lon,
          kind: 'survivor',
          label: s.temporary_ref,
          tone: s.status === 'missing' ? 'danger' : 'info',
          popup: `<strong>${s.temporary_ref}</strong><br/>${titleCase(s.status)}<br/>last seen ${timeAgo(s.last_seen_at)}`,
        })
      }
    }
    if (layers.shelters && data.shelters) {
      for (const sh of data.shelters) {
        const pct = sh.capacity > 0 ? Math.round((sh.occupancy_estimate / sh.capacity) * 100) : 0
        out.push({
          id: `sh-${sh.id}`,
          lat: sh.latitude,
          lng: sh.longitude,
          kind: 'shelter',
          label: sh.name,
          tone: pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'success',
          popup: `<strong>${sh.name}</strong><br/>${sh.occupancy_estimate}/${sh.capacity} (${pct}%)<br/>${titleCase(sh.status)}`,
        })
      }
    }
    return out
  }, [data, layers])

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header + offline warning */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <MapIcon className="h-5 w-5" /> Situation map
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nodes (deployment ref + live), incidents, survivors, shelters. Click a marker for details.
          </p>
        </div>
        {data && <FreshnessLabel timestamp={data.freshness.last_updated_at} />}
      </div>

      <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning-foreground">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>
          Online OSM tiles require internet. In offline deployment, preload a local tile package.
          Toggle the simulation below to preview offline behaviour.
        </span>
        <Switch checked={offlineTiles} onCheckedChange={setOfflineTiles} className="ml-auto" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Map */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <LoadingSkeleton rows={1} className="h-[500px]" />
            ) : isError ? (
              <ErrorState
                title="Could not load map data"
                description="The gateway may be unreachable."
                onRetry={() => refetch()}
                className="h-[500px]"
              />
            ) : !data || markers.length === 0 ? (
              <EmptyState title="No markers" description="No active records have location data." className="h-[500px]" />
            ) : offlineTiles ? (
              <div className="flex h-[500px] flex-col items-center justify-center gap-3 bg-muted/40 text-center text-muted-foreground">
                <WifiOff className="h-10 w-10 text-muted-foreground/50" />
                <div>
                  <p className="font-medium text-foreground">Offline tiles missing</p>
                  <p className="mt-1 max-w-xs text-sm">
                    No local tile package is available for the current zoom/area. Marker positions
                    are still tracked, but the base map cannot be rendered without offline tiles.
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-[500px]">
                <LeafletMap
                  markers={markers}
                  onMarkerClick={(m) => setSelected(m)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Layer controls + list fallback */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Layers className="h-4 w-4 text-muted-foreground" /> Layers
              </CardTitle>
              <CardDescription className="text-xs">Toggle which markers are visible.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <LayerToggle
                layer="nodes"
                layers={layers}
                setLayers={setLayers}
                icon={<Radio className="h-3.5 w-3.5" />}
                tone="success"
                count={data?.nodes?.length ?? 0}
              />
              <LayerToggle
                layer="incidents"
                layers={layers}
                setLayers={setLayers}
                icon={<Siren className="h-3.5 w-3.5" />}
                tone="danger"
                count={data?.incidents?.length ?? 0}
              />
              <LayerToggle
                layer="survivors"
                layers={layers}
                setLayers={setLayers}
                icon={<Users className="h-3.5 w-3.5" />}
                tone="info"
                count={data?.survivors?.length ?? 0}
              />
              <LayerToggle
                layer="shelters"
                layers={layers}
                setLayers={setLayers}
                icon={<Home className="h-3.5 w-3.5" />}
                tone="success"
                count={data?.shelters?.length ?? 0}
              />
            </CardContent>
          </Card>

          {/* List/table fallback (spec §6.2: "Provide list/table alternatives for operators who cannot use the map") */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Crosshair className="h-4 w-4 text-muted-foreground" /> All markers
              </CardTitle>
              <CardDescription className="text-xs">{markers.length} location(s)</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-72 overflow-y-auto scrollbar-thin">
                {markers.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground">No markers match the active layers.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {markers.map((m) => (
                      <li key={m.id}>
                        <button
                          onClick={() => setSelected(m)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent/50"
                        >
                          <span
                            className={cn('h-2 w-2 shrink-0 rounded-full', {
                              'bg-success': m.tone === 'success',
                              'bg-warning': m.tone === 'warning',
                              'bg-danger': m.tone === 'danger',
                              'bg-info': m.tone === 'info',
                              'bg-muted-foreground': m.tone === 'muted',
                            })}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{m.label}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">
                              {formatCoord(m.lat, m.lng).split(',')[0]}
                            </div>
                          </div>
                          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Legend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">Legend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-[11px]">
              <LegendRow shape="square" label="Node deployment ref" tone="success" />
              <LegendRow shape="circle" label="Node live GPS" tone="success" />
              <LegendRow shape="triangle" label="Incident" tone="danger" />
              <LegendRow shape="diamond" label="Survivor" tone="info" />
              <LegendRow shape="pentagon" label="Shelter" tone="success" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Marker detail sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:w-[400px]">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <MarkerIcon kind={selected.kind} />
                  {selected.label}
                </SheetTitle>
                <SheetDescription className="font-mono text-xs">
                  {formatCoord(selected.lat, selected.lng)}
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: selected.popup ?? '' }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    if (selected.kind === 'incident') {
                      const incId = selected.id.replace('inc-', '')
                      setView({ name: 'incident', incidentId: incId })
                    } else if (selected.kind === 'node' || selected.kind === 'node_live') {
                      const nodeId = selected.id.replace('node-dep-', '').replace('node-live-', '')
                      setView({ name: 'node', nodeId })
                    } else if (selected.kind === 'survivor') {
                      const survId = selected.id.replace('surv-', '')
                      setView({ name: 'survivors' })
                    } else if (selected.kind === 'shelter') {
                      setView({ name: 'shelters' })
                    }
                    setSelected(null)
                  }}
                >
                  Open full record <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function LayerToggle({
  layer,
  layers,
  setLayers,
  icon,
  tone,
  count,
}: {
  layer: LayerKey
  layers: Record<LayerKey, boolean>
  setLayers: (l: Record<LayerKey, boolean>) => void
  icon: React.ReactNode
  tone: 'success' | 'warning' | 'danger' | 'info' | 'muted'
  count: number
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <Switch
        checked={layers[layer]}
        onCheckedChange={(v) => setLayers({ ...layers, [layer]: v })}
      />
      <span
        className={cn('flex h-6 w-6 items-center justify-center rounded-md', {
          'bg-success/10 text-success': tone === 'success',
          'bg-warning/15 text-warning-foreground': tone === 'warning',
          'bg-danger/10 text-danger': tone === 'danger',
          'bg-info/10 text-info': tone === 'info',
          'bg-muted text-muted-foreground': tone === 'muted',
        })}
      >
        {icon}
      </span>
      <span className="flex-1 capitalize">{layer}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </label>
  )
}

function LegendRow({ shape, label, tone }: { shape: string; label: string; tone: string }) {
  const colors: Record<string, string> = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    muted: 'bg-muted-foreground',
  }
  const shapeClass =
    shape === 'square' ? 'rounded-sm' :
    shape === 'circle' ? 'rounded-full' :
    shape === 'triangle' ? 'rounded-sm rotate-45' :
    shape === 'diamond' ? 'rotate-45' :
    'rounded-sm'
  return (
    <div className="flex items-center gap-2">
      <span className={cn('h-3 w-3 shrink-0', shapeClass, colors[tone])} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}

function MarkerIcon({ kind }: { kind: string }) {
  if (kind === 'incident') return <Siren className="h-4 w-4" />
  if (kind === 'node' || kind === 'node_live') return <Radio className="h-4 w-4" />
  if (kind === 'survivor') return <Users className="h-4 w-4" />
  if (kind === 'shelter') return <Home className="h-4 w-4" />
  return <MapIcon className="h-4 w-4" />
}
