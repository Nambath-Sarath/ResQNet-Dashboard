'use client'

import { useState } from 'react'
import { useShelters, useUpdateShelter } from '@/lib/hooks'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { StatusBadge } from '@/components/shared/status-badge'
import { LoadingSkeleton, EmptyState, ErrorState } from '@/components/shared/state-views'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Home, Plus, Users, MapPin, Loader2, Pencil, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCoord, formatDateTime, timeAgo } from '@/lib/format'
import { toast } from 'sonner'
import { ApiRequestError } from '@/lib/api-client'

export function SheltersPage() {
  const { data, isLoading, isError, refetch } = useShelters()
  const update = useUpdateShelter()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [capacity, setCapacity] = useState('')
  const [occupancy, setOccupancy] = useState('')
  const [status, setStatus] = useState('OPEN')

  const openCreate = () => {
    setEditId(null)
    setName('')
    setLat('')
    setLon('')
    setCapacity('')
    setOccupancy('')
    setStatus('OPEN')
    setOpen(true)
  }
  const openEdit = (s: { id: string; name: string; latitude: number; longitude: number; capacity: number; occupancy_estimate: number; status: string }) => {
    setEditId(s.id)
    setName(s.name)
    setLat(String(s.latitude))
    setLon(String(s.longitude))
    setCapacity(String(s.capacity))
    setOccupancy(String(s.occupancy_estimate))
    setStatus(s.status)
    setOpen(true)
  }

  const submit = () => {
    if (!name || !lat || !lon || !capacity) {
      toast.error('Name, lat, lon, capacity required.')
      return
    }
    const latNum = parseFloat(lat)
    const lonNum = parseFloat(lon)
    const capNum = parseInt(capacity)
    const occNum = occupancy ? parseInt(occupancy) : 0
    if (Number.isNaN(latNum) || Number.isNaN(lonNum) || Number.isNaN(capNum)) {
      toast.error('Invalid numbers.')
      return
    }
    update.mutate(
      { name, latitude: latNum, longitude: lonNum, capacity: capNum, occupancy_estimate: occNum, status },
      {
        onSuccess: () => {
          toast.success(editId ? 'Shelter updated.' : 'Shelter created.')
          setOpen(false)
        },
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Failed'),
      },
    )
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Home className="h-5 w-5" /> Shelters
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Capacity, occupancy estimates, and status. Estimates are clearly labelled.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add shelter
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label="Total shelters" value={data.total} tone="muted" />
          <SummaryCard label="Total capacity" value={data.total_capacity} tone="info" />
          <SummaryCard label="Current occupancy" value={data.total_occupancy} tone="warning" />
          <SummaryCard
            label="Free beds"
            value={data.total_capacity - data.total_occupancy}
            tone="success"
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : isError ? (
          <ErrorState title="Could not load shelters" onRetry={() => refetch()} className="m-6" />
        ) : !data || data.shelters.length === 0 ? (
          <EmptyState title="No shelters recorded" icon={<Home className="h-6 w-6" />} className="col-span-full py-12" />
        ) : (
          data.shelters.map((s) => (
            <Card key={s.id} className={cn(s.is_full && 'border-danger/40', s.nearly_full && 'border-warning/40')}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={cn('flex h-8 w-8 items-center justify-center rounded-md', s.is_full ? 'bg-danger/10 text-danger' : s.nearly_full ? 'bg-warning/15 text-warning-foreground' : 'bg-success/10 text-success')}>
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {formatCoord(s.latitude, s.longitude).split(',')[0]}
                      </div>
                    </div>
                  </div>
                  <StatusBadge
                    tone={s.status === 'OPEN' ? 'success' : s.status === 'FULL' ? 'danger' : s.status === 'EVACUATING' ? 'warning' : 'muted'}
                    label={s.status}
                    size="sm"
                  />
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">Occupancy</span>
                    <span className="font-semibold tabular-nums">
                      {s.occupancy_estimate}/{s.capacity} <span className="text-[10px] text-muted-foreground">({s.occupancy_pct}%)</span>
                    </span>
                  </div>
                  <Progress
                    value={s.occupancy_pct}
                    className={cn('h-2', s.is_full ? '[--progress-bg:var(--danger)]' : s.nearly_full ? '[--progress-bg:var(--warning)]' : '[--progress-bg:var(--success)]')}
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {s.capacity - s.occupancy_estimate} beds free
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-2.5 w-2.5" /> updated {timeAgo(s.updated_at)}
                  </span>
                  <button onClick={() => openEdit(s)} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                    <Pencil className="h-2.5 w-2.5" /> Edit
                  </button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? `Edit ${name}` : 'Add shelter'}</DialogTitle>
            <DialogDescription>
              Occupancy values are <strong>estimates</strong> and must be labelled as such — not sensor-verified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sh-name" className="text-xs">Name</Label>
              <Input id="sh-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!!editId} placeholder="e.g. North Gate Hall" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sh-lat" className="text-xs">Latitude</Label>
                <Input id="sh-lat" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="17.6868" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-lon" className="text-xs">Longitude</Label>
                <Input id="sh-lon" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="83.2185" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sh-cap" className="text-xs">Capacity</Label>
                <Input id="sh-cap" type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-occ" className="text-xs">Occupancy estimate</Label>
                <Input id="sh-occ" type="number" value={occupancy} onChange={(e) => setOccupancy(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <div className="flex gap-2">
                {['OPEN', 'FULL', 'EVACUATING', 'CLOSED'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cn('flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors', status === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent')}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={update.isPending}>
              {update.isPending ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Saving…</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' | 'danger' | 'info' | 'muted' }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={cn('mt-1 text-2xl font-bold tabular-nums', {
          'text-success': tone === 'success',
          'text-warning-foreground': tone === 'warning',
          'text-danger': tone === 'danger',
          'text-info': tone === 'info',
        })}>
          {value}
        </div>
      </CardContent>
    </Card>
  )
}
