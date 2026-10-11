'use client'

import { useAppStore, type DashboardView } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Construction, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

const VIEW_META: Record<string, { title: string; description: string; stage: string }> = {
  map: {
    title: 'Situation Map',
    description: 'Leaflet-based map with node deployment references, SOS incidents, survivor locations, and shelters. Offline tile package support is planned.',
    stage: 'Stage 3',
  },
  survivors: {
    title: 'Survivor Registry',
    description: 'Temporary survivor IDs, first-seen/last-contact times, reported needs, and related incidents. Role-restricted to protect sensitive data.',
    stage: 'Stage 3',
  },
  modules: {
    title: 'Module Management',
    description: 'Cross-node view of all capability reports and per-module health. Allowlist-validated rendering only.',
    stage: 'Stage 2',
  },
  messages: {
    title: 'Communications',
    description: 'Message queue with CREATED → ACCEPTED → FORWARDED → ACKNOWLEDGED states, retry policy, and broadcast tracking.',
    stage: 'Stage 3',
  },
  resources: {
    title: 'Resources',
    description: 'Inventory of water, food, medical kits, blankets, fuel. Request/fulfilment workflow with low-stock thresholds.',
    stage: 'Stage 3',
  },
  shelters: {
    title: 'Shelters',
    description: 'Shelter capacity, occupancy estimates, status, and responsible operator. Estimates clearly labelled.',
    stage: 'Stage 3',
  },
  reports: {
    title: 'Reports',
    description: 'Incident totals, acknowledgement/resolution durations, node uptime, message outcomes, resource fulfilment. CSV/JSON export.',
    stage: 'Stage 3',
  },
  audit: {
    title: 'Audit Log',
    description: 'Restricted history of operator actions and sensitive reads. Filterable by actor, action, entity, time.',
    stage: 'Stage 3',
  },
  settings: {
    title: 'System Settings',
    description: 'Operator management, role assignment, alert thresholds, heartbeat timeout, backup/restore, offline map inventory, build version.',
    stage: 'Stage 3',
  },
}

export function ComingSoon({ view }: { view: DashboardView }) {
  const meta = VIEW_META[view.name]
  const setView = useAppStore((s) => s.setView)
  if (!meta) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">Unknown view.</CardContent>
        </Card>
      </div>
    )
  }
  return (
    <div className="p-4 sm:p-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Construction className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{meta.title}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {meta.description}
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Planned for {meta.stage}
          </div>
          <Button variant="outline" size="sm" onClick={() => setView({ name: 'overview' })}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to overview
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
