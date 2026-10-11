'use client'

import { useState } from 'react'
import { useLockDeployment } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { StatusBadge } from '@/components/shared/status-badge'
import { toast } from 'sonner'
import { Lock, MapPin, Edit3, AlertTriangle, ShieldAlert } from 'lucide-react'
import { formatCoord, formatDateTime } from '@/lib/format'

type NodeDetail = {
  id: string
  display_name: string
  deployment_lat: number | null
  deployment_lon: number | null
  deployment_accuracy_m: number | null
  deployment_locked_by: string | null
  deployment_locked_at: string | null
  lifecycle_state: string
}

/**
 * Card showing the locked deployment reference with an edit action that
 * requires confirmation (spec §6.5: "Locking a reference location should
 * store who set it and when. Updating it should require explicit permission
 * and generate an audit event.")
 */
export function DeploymentLockCard({ node }: { node: NodeDetail }) {
  const lock = useLockDeployment()
  const [open, setOpen] = useState(false)
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [acc, setAcc] = useState('')
  const setView = useAppStore((s) => s.setView)

  const isLocked = node.deployment_locked_at != null
  const isDeployed = node.lifecycle_state === 'DEPLOYED'

  const openDialog = () => {
    setLat(node.deployment_lat != null ? String(node.deployment_lat.toFixed(6)) : '')
    setLon(node.deployment_lon != null ? String(node.deployment_lon.toFixed(6)) : '')
    setAcc(node.deployment_accuracy_m != null ? String(node.deployment_accuracy_m) : '8')
    setOpen(true)
  }

  const submit = (confirm: boolean) => {
    const latNum = parseFloat(lat)
    const lonNum = parseFloat(lon)
    const accNum = acc ? parseFloat(acc) : undefined
    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) {
      toast.error('Enter valid numeric coordinates.')
      return
    }
    lock.mutate(
      { nodeId: node.id, latitude: latNum, longitude: lonNum, accuracy_m: accNum, confirm },
      {
        onSuccess: () => {
          toast.success(confirm ? 'Deployment reference updated.' : 'Deployment reference locked.')
          setOpen(false)
        },
        onError: (e) => {
          if (e.message.includes('CONFIRMATION_REQUIRED')) {
            toast.error('This node is already deployed. Confirm the override to proceed.')
          } else {
            toast.error(e.message)
          }
        },
      },
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Locked deployment reference
          </span>
          {isLocked ? (
            <StatusBadge tone="success" label="Locked" size="sm" />
          ) : (
            <StatusBadge tone="warning" label="Unset" size="sm" />
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Separate from live GPS. Updating requires confirmation and is audited.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5 text-sm">
        <Row label="Coordinates">
          <span className="font-mono text-xs">
            {formatCoord(node.deployment_lat, node.deployment_lon)}
          </span>
        </Row>
        <Row label="Accuracy">
          <span className="tabular-nums">
            {node.deployment_accuracy_m != null ? `±${node.deployment_accuracy_m} m` : '—'}
          </span>
        </Row>
        {node.deployment_locked_by && (
          <Row label="Locked by">
            <span className="font-mono text-xs">{node.deployment_locked_by.slice(-8)}</span>
          </Row>
        )}
        <Row label="Locked at">
          <span className="tabular-nums text-xs">{formatDateTime(node.deployment_locked_at)}</span>
        </Row>

        {isDeployed && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Node is <strong>DEPLOYED</strong>. Changing the reference requires explicit confirmation and creates an audit entry.
            </span>
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="mt-2 w-full" onClick={openDialog}>
              <Edit3 className="mr-1 h-3.5 w-3.5" />
              {isLocked ? 'Update reference' : 'Lock reference'}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-warning-foreground" />
                {isDeployed ? 'Override deployment reference?' : 'Set deployment reference'}
              </DialogTitle>
              <DialogDescription>
                This is the authoritative fixed position for {node.display_name}. A displacement alert compares live GPS against this value.
                {isDeployed && ' The node is already deployed — overriding will be recorded in the audit trail.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dep-lat">Latitude</Label>
                <Input id="dep-lat" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="17.6868" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dep-lon">Longitude</Label>
                <Input id="dep-lon" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="83.2185" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-acc">Accuracy (metres)</Label>
              <Input id="dep-acc" value={acc} onChange={(e) => setAcc(e.target.value)} placeholder="8" type="number" />
            </div>
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Current: {formatCoord(node.deployment_lat, node.deployment_lon)}
                {node.deployment_accuracy_m != null ? ` (±${node.deployment_accuracy_m} m)` : ''}
              </span>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              {isDeployed ? (
                <Button
                  variant="destructive"
                  disabled={lock.isPending}
                  onClick={() => submit(true)}
                >
                  <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                  Confirm override
                </Button>
              ) : (
                <Button disabled={lock.isPending} onClick={() => submit(false)}>
                  <Lock className="mr-1 h-3.5 w-3.5" />
                  Lock reference
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}
