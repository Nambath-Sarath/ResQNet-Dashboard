'use client'

import { useNotifPrefs, type AlertKey } from '@/lib/notif-prefs'
import { playAlert } from '@/lib/sound'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Volume2, VolumeX, Bell, BellOff, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type AlertRow = {
  key: AlertKey
  label: string
  description: string
  soundPattern: string
}

const ALERTS: AlertRow[] = [
  { key: 'incident.created_critical', label: 'New critical SOS', description: 'CRITICAL priority incident created', soundPattern: 'critical_new' },
  { key: 'incident.created_high', label: 'New high SOS', description: 'HIGH priority incident created', soundPattern: 'message' },
  { key: 'incident.resolved', label: 'Incident resolved', description: 'An incident was marked resolved', soundPattern: 'resolve' },
  { key: 'incident.acknowledged', label: 'Incident acknowledged', description: 'Operator acknowledged an incident', soundPattern: 'message' },
  { key: 'node.displacement_warning', label: 'Node displacement', description: 'Node moved beyond deployment reference', soundPattern: 'displacement' },
  { key: 'system.health_changed', label: 'System health', description: 'Gateway/backup/clock health changed', soundPattern: 'offline' },
  { key: 'message.delivery_updated', label: 'Message delivery', description: 'Message status changed', soundPattern: 'message' },
]

/**
 * Notification preferences panel — added to the Settings page.
 * Operators can toggle sound/toast per event type, adjust volume, and test sounds.
 */
export function NotificationPreferences() {
  const {
    soundEnabled,
    toastEnabled,
    volume,
    soundOverrides,
    toastOverrides,
    setSoundEnabled,
    setToastEnabled,
    setVolume,
    setSoundOverride,
    setToastOverride,
    shouldPlaySound,
    shouldShowToast,
  } = useNotifPrefs()

  const resetAll = () => {
    ALERTS.forEach((a) => {
      setSoundOverride(a.key, null)
      setToastOverride(a.key, null)
    })
    setVolume(0.5)
    setSoundEnabled(true)
    setToastEnabled(true)
    toast.success('Notification preferences reset to defaults.')
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            Notification preferences
          </span>
          <Button variant="ghost" size="sm" onClick={resetAll}>
            <RotateCcw className="mr-1 h-3 w-3" /> Reset
          </Button>
        </CardTitle>
        <CardDescription className="text-xs">
          Configure audible + visual alerts per event type. Sound alerts help operators who may be
          on another tab when a critical SOS arrives (spec §15).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Master toggles */}
        <div className="grid grid-cols-2 gap-3">
          <div className={cn('rounded-md border p-3', soundEnabled ? 'border-success/30 bg-success/5' : 'border-border bg-muted/30')}>
            <label className="flex cursor-pointer items-center justify-between">
              <span className="flex items-center gap-2 text-sm">
                {soundEnabled ? <Volume2 className="h-4 w-4 text-success" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
                <span>
                  <span className="font-medium">Sound alerts</span>
                  <span className="block text-[10px] text-muted-foreground">Audible beeps for critical events</span>
                </span>
              </span>
              <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
            </label>
          </div>
          <div className={cn('rounded-md border p-3', toastEnabled ? 'border-info/30 bg-info/5' : 'border-border bg-muted/30')}>
            <label className="flex cursor-pointer items-center justify-between">
              <span className="flex items-center gap-2 text-sm">
                {toastEnabled ? <Bell className="h-4 w-4 text-info" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                <span>
                  <span className="font-medium">Toast notifications</span>
                  <span className="block text-[10px] text-muted-foreground">On-screen popups</span>
                </span>
              </span>
              <Switch checked={toastEnabled} onCheckedChange={setToastEnabled} />
            </label>
          </div>
        </div>

        {/* Volume slider */}
        {soundEnabled && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Volume</span>
              <span className="tabular-nums font-medium">{Math.round(volume * 100)}%</span>
            </div>
            <Slider
              value={[volume]}
              onValueChange={(v) => setVolume(v[0])}
              min={0}
              max={1}
              step={0.05}
            />
          </div>
        )}

        {/* Per-event-type matrix */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Per-event configuration
          </div>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Event</th>
                  <th className="px-3 py-2 text-center font-medium w-16">Sound</th>
                  <th className="px-3 py-2 text-center font-medium w-16">Toast</th>
                  <th className="px-3 py-2 text-center font-medium w-14">Test</th>
                </tr>
              </thead>
              <tbody>
                {ALERTS.map((a) => {
                  const soundOn = shouldPlaySound(a.key)
                  const toastOn = shouldShowToast(a.key)
                  const soundOverride = a.key in soundOverrides ? soundOverrides[a.key] : null
                  const toastOverride = a.key in toastOverrides ? toastOverrides[a.key] : null
                  return (
                    <tr key={a.key} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground/90">{a.label}</div>
                        <div className="text-[10px] text-muted-foreground">{a.description}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => setSoundOverride(a.key, soundOverride === null ? !soundOn : null)}
                          className={cn(
                            'inline-flex h-5 w-9 items-center rounded-full transition-colors',
                            soundOn ? 'bg-success' : 'bg-muted-foreground/30',
                            soundOverride !== null && 'ring-1 ring-offset-1 ring-success',
                          )}
                          title={soundOverride !== null ? 'Custom (click to reset to default)' : 'Default (click to override)'}
                        >
                          <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform', soundOn ? 'translate-x-4.5' : 'translate-x-1')} style={{ transform: soundOn ? 'translateX(18px)' : 'translateX(4px)' }} />
                        </button>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => setToastOverride(a.key, toastOverride === null ? !toastOn : null)}
                          className={cn(
                            'inline-flex h-5 w-9 items-center rounded-full transition-colors',
                            toastOn ? 'bg-info' : 'bg-muted-foreground/30',
                            toastOverride !== null && 'ring-1 ring-offset-1 ring-info',
                          )}
                          title={toastOverride !== null ? 'Custom (click to reset)' : 'Default (click to override)'}
                        >
                          <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform')} style={{ transform: toastOn ? 'translateX(18px)' : 'translateX(4px)' }} />
                        </button>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => playAlert(a.soundPattern)}
                          disabled={!soundEnabled}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                          title="Test sound"
                        >
                          <Play className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground">
            <span className="font-medium">Ring outline</span> = custom override. Click a toggled pill to reset to default.
          </p>
        </div>

        {/* Sound test */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2.5 text-xs">
          <span className="text-muted-foreground">Test all sounds:</span>
          <Button variant="outline" size="sm" disabled={!soundEnabled} onClick={() => playAlert('critical_new')}>
            Critical
          </Button>
          <Button variant="outline" size="sm" disabled={!soundEnabled} onClick={() => playAlert('displacement')}>
            Displacement
          </Button>
          <Button variant="outline" size="sm" disabled={!soundEnabled} onClick={() => playAlert('resolve')}>
            Resolve
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
