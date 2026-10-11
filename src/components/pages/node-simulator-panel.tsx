'use client'

import { useState } from 'react'
import { useNodeSecret, useSimulateHeartbeat, useSubmitCapabilities } from '@/lib/hooks'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Radio,
  Battery,
  Wifi,
  MapPin,
  Send,
  Cpu,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'

type Props = { nodeId: string }

/**
 * Simulator panel (admin only) — lets an operator post authenticated heartbeats
 * and capability reports on behalf of a node, to exercise the realtime pipeline.
 * In production the node firmware posts these directly.
 */
export function NodeSimulatorPanel({ nodeId }: Props) {
  const { data: secretData, isLoading: secretLoading } = useNodeSecret(nodeId)
  const hb = useSimulateHeartbeat()
  const caps = useSubmitCapabilities()
  const user = useAppStore((s) => s.user)
  const [showSecret, setShowSecret] = useState(false)
  const [battery, setBattery] = useState(85)
  const [link, setLink] = useState(80)
  const [clients, setClients] = useState(5)
  const [uptime, setUptime] = useState(120)
  const [rssi, setRssi] = useState(-65)
  const [moveLat, setMoveLat] = useState('')
  const [moveLon, setMoveLon] = useState('')
  const [displace, setDisplace] = useState(false)

  // Capability descriptor presets
  const [capsPreset, setCapsPreset] = useState('gps_camera')

  if (user?.role !== 'ADMINISTRATOR') {
    return null
  }

  const sendHeartbeat = (withLocation: boolean) => {
    if (!secretData?.auth_secret) {
      toast.error('No node secret available.')
      return
    }
    let location:
      | { latitude: number; longitude: number; accuracy_m: number; source: string }
      | undefined
    if (withLocation) {
      const lat = parseFloat(moveLat)
      const lon = parseFloat(moveLon)
      if (Number.isNaN(lat) || Number.isNaN(lon)) {
        toast.error('Enter valid lat/lon for the location ping.')
        return
      }
      location = { latitude: lat, longitude: lon, accuracy_m: displace ? 8 : 20, source: 'GPS_MODULE' }
    }
    hb.mutate(
      {
        nodeId,
        nodeSecret: secretData.auth_secret,
        payload: {
          battery,
          link_quality: link,
          connected_clients: clients,
          uptime_seconds: uptime * 60,
          rssi,
          location,
        },
      },
      {
        onSuccess: (r) => {
          if (r.displacement_warning) {
            toast.warning('Displacement alert triggered!', {
              description: `Node moved beyond deployment threshold.`,
            })
          } else {
            toast.success('Heartbeat accepted.', {
              description: `health_state=${r.health_state}`,
            })
          }
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  const sendCapabilities = () => {
    if (!secretData?.auth_secret) return
    const descriptor = buildDescriptor(capsPreset, nodeId)
    caps.mutate(
      { nodeId, nodeSecret: secretData.auth_secret, descriptor },
      {
        onSuccess: (r) => {
          if (r.valid) {
            toast.success('Capability report accepted.', {
              description: `${descriptor.modules.length} module(s) validated.`,
            })
          } else {
            toast.error('Capability report rejected.', {
              description: r.validation_errors?.join('; '),
            })
          }
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <Card className="border-dashed border-warning/40 bg-warning/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Radio className="h-4 w-4 text-warning-foreground" />
          Node simulator
          <span className="ml-1 rounded bg-warning/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning-foreground">
            Admin
          </span>
        </CardTitle>
        <CardDescription className="text-xs">
          Post authenticated heartbeats and capability reports to exercise the realtime pipeline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Secret */}
        <div className="space-y-1.5">
          <Label className="text-xs">Node auth secret (X-Node-Secret)</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-muted/50 px-2 py-1.5 font-mono text-[10px]">
              {secretLoading
                ? 'loading…'
                : showSecret
                  ? secretData?.auth_secret
                  : '••••••••-••••-••••-••••-•••••••••'}
            </code>
            <Button variant="ghost" size="icon" onClick={() => setShowSecret((s) => !s)}>
              {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Heartbeat controls */}
        <div className="space-y-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Heartbeat payload
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SliderField icon={<Battery className="h-3 w-3" />} label="Battery" value={battery} onChange={setBattery} min={0} max={100} unit="%" />
            <SliderField icon={<Wifi className="h-3 w-3" />} label="Link" value={link} onChange={setLink} min={0} max={100} unit="%" />
            <SliderField icon={<Radio className="h-3 w-3" />} label="Clients" value={clients} onChange={setClients} min={0} max={50} unit="" />
            <SliderField icon={<Radio className="h-3 w-3" />} label="Uptime" value={uptime} onChange={setUptime} min={0} max={1000} unit="min" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">RSSI</span>
            <Input
              type="number"
              value={rssi}
              onChange={(e) => setRssi(parseInt(e.target.value || '0'))}
              className="h-7 w-20 text-xs"
            />
            <span className="text-[10px] text-muted-foreground">dBm</span>
          </div>
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Optional GPS location ping</Label>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Simulate displacement</span>
              <Switch checked={displace} onCheckedChange={setDisplace} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={moveLat}
              onChange={(e) => setMoveLat(e.target.value)}
              placeholder="latitude"
              className="h-8 text-xs"
            />
            <Input
              value={moveLon}
              onChange={(e) => setMoveLon(e.target.value)}
              placeholder="longitude"
              className="h-8 text-xs"
            />
          </div>
          {displace && (
            <p className="flex items-center gap-1 text-[10px] text-warning-foreground">
              <AlertTriangle className="h-3 w-3" />
              Will use a small accuracy (8m) to satisfy the displacement rule (&gt;200m, &lt;30m accuracy).
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => sendHeartbeat(false)} disabled={hb.isPending}>
            <Send className="mr-1 h-3 w-3" /> Send heartbeat
          </Button>
          <Button size="sm" variant="outline" onClick={() => sendHeartbeat(true)} disabled={hb.isPending}>
            <MapPin className="mr-1 h-3 w-3" /> Heartbeat + location
          </Button>
        </div>

        {/* Capabilities */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Capability report
          </div>
          <Select value={capsPreset} onValueChange={setCapsPreset}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gps_only">GPS only</SelectItem>
              <SelectItem value="gps_camera">GPS + Camera</SelectItem>
              <SelectItem value="gps_imu_env">GPS + IMU + Environment</SelectItem>
              <SelectItem value="gps_unknown">GPS + Unknown module (rejected)</SelectItem>
              <SelectItem value="empty">No optional modules</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={sendCapabilities} disabled={caps.isPending}>
            <Cpu className="mr-1 h-3 w-3" /> Submit capability report
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SliderField({
  icon,
  label,
  value,
  onChange,
  min,
  max,
  unit,
}: {
  icon: React.ReactNode
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  unit: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className="tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <Slider value={[value]} onValueChange={(v) => onChange(v[0])} min={min} max={max} step={1} className="py-1" />
    </div>
  )
}

function buildDescriptor(preset: string, nodeId: string) {
  const base = {
    protocol_version: '1.0',
    firmware_version: '1.4.2',
    hardware_revision: 'A2',
    reported_at: new Date().toISOString(),
  }
  const mod = (type: string, caps: string[], status = 'ONLINE', fw = '1.0.0') => ({
    module_id: `${type}-${nodeId.split('-')[1]}`,
    type,
    status,
    capabilities: caps,
    firmware_version: fw,
  })
  switch (preset) {
    case 'gps_only':
      return { ...base, modules: [mod('GPS', ['location', 'speed', 'utc_time'], 'ONLINE', '1.0.2')] }
    case 'gps_camera':
      return {
        ...base,
        modules: [
          mod('GPS', ['location', 'speed', 'utc_time'], 'ONLINE', '1.0.2'),
          mod('CAMERA', ['photo_capture'], 'ONLINE', '1.0.0'),
        ],
      }
    case 'gps_imu_env':
      return {
        ...base,
        modules: [
          mod('GPS', ['location', 'speed', 'utc_time'], 'ONLINE', '1.0.2'),
          mod('IMU', ['motion', 'tilt'], 'DEGRADED', '0.9.1'),
          mod('ENVIRONMENT', ['temp', 'humidity', 'pressure'], 'ONLINE', '1.1.0'),
        ],
      }
    case 'gps_unknown':
      return {
        ...base,
        modules: [
          mod('GPS', ['location', 'speed', 'utc_time'], 'ONLINE', '1.0.2'),
          mod('QCORP', ['unknown_capability'], 'ONLINE', '0.1.0'), // not on allowlist
        ],
      }
    case 'empty':
      return { ...base, modules: [] }
    default:
      return { ...base, modules: [] }
  }
}
