'use client'

import { useState } from 'react'
import { useResources, useResourceRequests, useUpdateResource, useCreateResourceRequest } from '@/lib/hooks'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Package,
  AlertTriangle,
  Plus,
  MapPin,
  TrendingDown,
  Send,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime, timeAgo } from '@/lib/format'
import { toast } from 'sonner'
import { ApiRequestError } from '@/lib/api-client'

const RESOURCE_TYPES = [
  { value: 'WATER', label: 'Water', unit: 'litres' },
  { value: 'FOOD', label: 'Food kits', unit: 'kits' },
  { value: 'MEDICAL_KIT', label: 'Medical kits', unit: 'kits' },
  { value: 'BLANKET', label: 'Blankets', unit: 'units' },
  { value: 'FUEL', label: 'Fuel', unit: 'litres' },
  { value: 'TARP', label: 'Tarps', unit: 'units' },
]

export function ResourcesPage() {
  const { data, isLoading, isError, refetch } = useResources()
  const { data: requestsData } = useResourceRequests()
  const update = useUpdateResource()
  const createReq = useCreateResourceRequest()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('WATER')
  const [quantity, setQuantity] = useState('')
  const [location, setLocation] = useState('')
  const [reqOpen, setReqOpen] = useState(false)
  const [reqType, setReqType] = useState('WATER')
  const [reqQty, setReqQty] = useState('')
  const [reqNotes, setReqNotes] = useState('')

  const updateResource = (id: string, currentType: string, currentUnit: string, currentQty: number, currentLoc: string | null) => {
    const newQtyStr = prompt(`New quantity for ${currentType} (current: ${currentQty}):`, String(currentQty))
    if (newQtyStr == null) return
    const newQty = Number(newQtyStr)
    if (Number.isNaN(newQty) || newQty < 0) {
      toast.error('Invalid quantity.')
      return
    }
    update.mutate(
      { resource_type: currentType, unit: currentUnit, quantity: newQty, location_label: currentLoc ?? undefined },
      {
        onSuccess: () => toast.success('Resource updated.'),
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Failed'),
      },
    )
  }

  const submitNew = () => {
    const rt = RESOURCE_TYPES.find((r) => r.value === type)
    if (!rt || !quantity) {
      toast.error('Select type and quantity.')
      return
    }
    update.mutate(
      { resource_type: type, unit: rt.unit, quantity: Number(quantity), location_label: location || undefined },
      {
        onSuccess: () => {
          toast.success('Resource created/updated.')
          setOpen(false)
          setQuantity('')
          setLocation('')
        },
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Failed'),
      },
    )
  }

  const submitRequest = () => {
    const rt = RESOURCE_TYPES.find((r) => r.value === reqType)
    if (!rt || !reqQty) {
      toast.error('Select type and quantity.')
      return
    }
    createReq.mutate(
      { resource_type: reqType, unit: rt.unit, quantity: Number(reqQty), notes: reqNotes || undefined },
      {
        onSuccess: () => {
          toast.success('Resource request submitted.')
          setReqOpen(false)
          setReqQty('')
          setReqNotes('')
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
            <Package className="h-5 w-5" /> Resources
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Inventory of water, food, medical kits, blankets, fuel. Manual updates only.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={reqOpen} onOpenChange={(o) => { setReqOpen(o); if (!o) { setReqQty(''); setReqNotes('') } }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Send className="mr-1 h-4 w-4" /> Request
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Submit resource request</DialogTitle>
                <DialogDescription>Request additional stock from the supply chain.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <select
                    value={reqType}
                    onChange={(e) => setReqType(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    {RESOURCE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="req-qty" className="text-xs">Quantity</Label>
                  <Input id="req-qty" type="number" value={reqQty} onChange={(e) => setReqQty(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="req-notes" className="text-xs">Notes</Label>
                  <Input id="req-notes" value={reqNotes} onChange={(e) => setReqNotes(e.target.value)} placeholder="e.g. Urgent — shelter at capacity" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReqOpen(false)}>Cancel</Button>
                <Button onClick={submitRequest} disabled={createReq.isPending || !reqQty}>
                  {createReq.isPending ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Submitting…</> : <><Send className="mr-1 h-3.5 w-3.5" /> Submit request</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQuantity(''); setLocation('') } }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" /> Add / update
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add or update resource</DialogTitle>
                <DialogDescription>If a resource of this type exists at the same location, it will be updated.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    {RESOURCE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qty" className="text-xs">Quantity</Label>
                  <Input id="qty" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="loc" className="text-xs">Location label (optional)</Label>
                  <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Shelter Delta" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submitNew} disabled={update.isPending || !quantity}>
                  {update.isPending ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Saving…</> : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="requests">Requests {requestsData && `(${requestsData.total})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          {isLoading ? (
            <LoadingSkeleton rows={4} />
          ) : isError ? (
            <ErrorState title="Could not load resources" onRetry={() => refetch()} className="m-6" />
          ) : !data || data.resources.length === 0 ? (
            <EmptyState title="No resources recorded" icon={<Package className="h-6 w-6" />} className="py-12" />
          ) : (
            <>
              {data.low_stock_count > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger">
                  <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                  <span><strong>{data.low_stock_count}</strong> resource(s) below low-stock threshold (≤20% of total).</span>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.resources.map((r) => {
                  const pct = r.quantity > 0 ? Math.round((r.available_quantity / r.quantity) * 100) : 0
                  return (
                    <Card key={r.id} className={cn(r.low_stock && 'border-danger/40')}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium">{r.resource_type.replace(/_/g, ' ').toLowerCase()}</div>
                            <div className="text-[10px] text-muted-foreground">{r.location_label ?? 'No location'}</div>
                          </div>
                          {r.low_stock && <StatusBadge tone="danger" label="Low" size="sm" pulse />}
                        </div>
                        <div className="mt-3">
                          <div className="mb-1 flex items-baseline justify-between text-xs">
                            <span className="text-muted-foreground">Available</span>
                            <span className="font-semibold tabular-nums">
                              {r.available_quantity} <span className="text-[10px] text-muted-foreground">{r.unit}</span>
                            </span>
                          </div>
                          <Progress
                            value={pct}
                            className={cn('h-2', pct <= 20 ? '[--progress-bg:var(--danger)]' : pct <= 50 ? '[--progress-bg:var(--warning)]' : '[--progress-bg:var(--success)]')}
                          />
                          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                            <span>reserved: {r.reserved_quantity} {r.unit}</span>
                            <span>total: {r.quantity} {r.unit}</span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>updated {timeAgo(r.updated_at)}</span>
                          <button
                            onClick={() => updateResource(r.id, r.resource_type, r.unit, r.quantity, r.location_label)}
                            className="text-primary hover:underline"
                          >
                            Update
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resource requests</CardTitle>
              <CardDescription className="text-xs">Inbound requests from shelters / field teams.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!requestsData || requestsData.requests.length === 0 ? (
                <EmptyState title="No requests" className="py-8" />
              ) : (
                <ul className="divide-y divide-border">
                  {requestsData.requests.map((req) => {
                    const tone = req.status === 'OPEN' ? 'warning' : req.status === 'FULFILLED' ? 'success' : req.status === 'DENIED' ? 'danger' : 'info'
                    return (
                      <li key={req.id} className="flex items-start gap-3 px-4 py-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <Package className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{req.resource_type.replace(/_/g, ' ').toLowerCase()}</span>
                            <span className="text-xs tabular-nums">{req.quantity} {req.unit}</span>
                            <StatusBadge tone={tone} label={req.status} size="sm" />
                          </div>
                          {req.notes && <p className="mt-0.5 text-xs text-muted-foreground">{req.notes}</p>}
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            requested by {req.requested_by ?? 'unknown'} · {timeAgo(req.created_at)}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
