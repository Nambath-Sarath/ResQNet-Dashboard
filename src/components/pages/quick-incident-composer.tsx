'use client'

import { useState } from 'react'
import { useCreateIncident } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Send, Loader2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { ApiRequestError } from '@/lib/api-client'

const CATEGORIES = [
  { value: 'RESCUE', label: 'Rescue' },
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'FIRE', label: 'Fire' },
  { value: 'FLOOD', label: 'Flood' },
  { value: 'STRUCTURE', label: 'Structure' },
  { value: 'SUPPLY', label: 'Supply' },
  { value: 'COMMUNICATION', label: 'Communication' },
  { value: 'OTHER', label: 'Other' },
]

const PRIORITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
]

/**
 * Operator-initiated SOS composer (spec §7.3 example).
 * Creates an incident via POST /api/v1/incidents with optional location.
 */
export function QuickIncidentComposer() {
  const [open, setOpen] = useState(false)
  const create = useCreateIncident()
  const setView = useAppStore((s) => s.setView)

  const [category, setCategory] = useState('RESCUE')
  const [priority, setPriority] = useState('HIGH')
  const [description, setDescription] = useState('')
  const [people, setPeople] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')

  const reset = () => {
    setCategory('RESCUE')
    setPriority('HIGH')
    setDescription('')
    setPeople('')
    setLat('')
    setLon('')
  }

  const submit = () => {
    if (!description.trim()) {
      toast.error('Description is required.')
      return
    }
    const payload: Parameters<typeof create.mutate>[0] = {
      category,
      description: description.trim(),
      priority,
      source_type: 'operator',
      people_affected: people ? Number(people) : undefined,
    }
    if (lat && lon) {
      payload.location = {
        latitude: Number(lat),
        longitude: Number(lon),
        source: 'MANUAL',
        accuracy_m: 50,
      }
    }
    create.mutate(payload, {
      onSuccess: (r) => {
        toast.success(`Incident ${r.incident_id} created.`, {
          description: 'Realtime event published to all dashboards.',
          action: {
            label: 'Open',
            onClick: () => {
              setOpen(false)
              reset()
              setView({ name: 'incident', incidentId: r.incident_id })
            },
          },
        })
        setOpen(false)
        reset()
      },
      onError: (e) => {
        toast.error(e instanceof ApiRequestError ? e.message : 'Could not create incident.')
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> New incident
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create incident</DialogTitle>
          <DialogDescription>
            Operator-submitted SOS. Idempotency key is generated automatically. A realtime event is
            published to all connected dashboards after the DB write succeeds.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inc-desc" className="text-xs">
              Description <span className="text-danger">*</span>
            </Label>
            <Textarea
              id="inc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Three people stranded on the second floor, water rising."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inc-ppl" className="text-xs">People affected</Label>
              <Input
                id="inc-ppl"
                type="number"
                value={people}
                onChange={(e) => setPeople(e.target.value)}
                placeholder="0"
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inc-lat" className="text-xs">Latitude</Label>
              <Input
                id="inc-lat"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="17.6868"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inc-lon" className="text-xs">Longitude</Label>
              <Input
                id="inc-lon"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                placeholder="83.2185"
              />
            </div>
          </div>
          {lat && lon && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              Location source: MANUAL (operator-entered, accuracy ±50m)
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || !description.trim()}>
            {create.isPending ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Creating…
              </>
            ) : (
              <>
                <Send className="mr-1 h-3.5 w-3.5" /> Create incident
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
