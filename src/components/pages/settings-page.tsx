'use client'

import { useState } from 'react'
import { useOperators, useCreateOperator, useThresholds, useOverview } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { LoadingSkeleton, EmptyState, ErrorState, ForbiddenState } from '@/components/shared/state-views'
import { NotificationPreferences } from './notification-preferences'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Settings as SettingsIcon,
  Users,
  SlidersHorizontal,
  Plus,
  Server,
  Database,
  HardDrive,
  ShieldCheck,
  Clock,
  Loader2,
  KeyRound,
  Download,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime, formatUptime, titleCase } from '@/lib/format'
import { toast } from 'sonner'
import { ApiRequestError } from '@/lib/api-client'

export function SettingsPage() {
  const { data: overview } = useOverview()
  const { data: thresholds, isLoading: thresholdsLoading } = useThresholds()
  const user = useAppStore((s) => s.user)
  const isAdmin = user?.role === 'ADMINISTRATOR'

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <SettingsIcon className="h-5 w-5" /> Settings
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Operator management, alert thresholds, gateway health, backup status. Build v{thresholds?.build_version ?? '0.2.0'}.
        </p>
      </div>

      {!isAdmin && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Your role ({user?.role.toLowerCase()}) has read-only access. Only administrators can manage operators or change thresholds.
          </span>
        </div>
      )}

      <Tabs defaultValue="operators">
        <TabsList>
          <TabsTrigger value="operators">Operators</TabsTrigger>
          <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="gateway">Gateway</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
        </TabsList>

        {/* Operators */}
        <TabsContent value="operators" className="space-y-4">
          <OperatorsTab canManage={isAdmin} />
        </TabsContent>

        {/* Thresholds */}
        <TabsContent value="thresholds" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" /> Alert thresholds
              </CardTitle>
              <CardDescription className="text-xs">
                Configurable bounds for heartbeat timeout, battery, link quality, displacement. Changes are audited.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {thresholdsLoading ? (
                <LoadingSkeleton rows={6} />
              ) : thresholds ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.entries(thresholds.thresholds).map(([k, v]) => (
                    <ThresholdRow key={k} label={k} value={v as number} canManage={isAdmin} />
                  ))}
                </div>
              ) : (
                <EmptyState title="Could not load thresholds" className="py-6" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="space-y-4">
          <NotificationPreferences />
        </TabsContent>

        {/* Gateway health */}
        <TabsContent value="gateway" className="space-y-4">
          {overview && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <GatewayMetric icon={<Server className="h-4 w-4" />} label="API status" value={overview.gateway_health.api_status} tone={overview.gateway_health.api_status === 'ok' ? 'success' : 'danger'} />
              <GatewayMetric icon={<Database className="h-4 w-4" />} label="Database" value={overview.gateway_health.database_status} tone={overview.gateway_health.database_status === 'connected' ? 'success' : 'danger'} />
              <GatewayMetric icon={<HardDrive className="h-4 w-4" />} label="Uptime" value={formatUptime(overview.gateway_health.uptime_seconds)} tone="info" />
              <GatewayMetric icon={<Clock className="h-4 w-4" />} label="Server time" value={formatDateTime(overview.gateway_health.server_time)} tone="muted" small />
              <GatewayMetric icon={<ShieldCheck className="h-4 w-4" />} label="Last backup" value={overview.gateway_health.last_backup_at ? formatDateTime(overview.gateway_health.last_backup_at) : 'Never'} tone={overview.gateway_health.last_backup_at ? 'success' : 'warning'} small />
              <GatewayMetric icon={<HardDrive className="h-4 w-4" />} label="Storage" value={overview.gateway_health.storage_note} tone="muted" small />
            </div>
          )}
        </TabsContent>

        {/* Backup */}
        <TabsContent value="backup" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Backup & restore</CardTitle>
              <CardDescription className="text-xs">
                Spec §6.10 + §9.2: "Test restoring a backup; creating backups without testing restoration is insufficient."
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last backup</span>
                  <span className="tabular-nums">{overview?.gateway_health.last_backup_at ? formatDateTime(overview.gateway_health.last_backup_at) : 'Never'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-muted-foreground">Destination</span>
                  <span className="text-xs">/var/backups/resqnet (separate storage)</span>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  In production, backups must be tested on a separate Pi before deployment.
                  SD-card-only backups are insufficient — use a separate storage target.
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!isAdmin}>
                  <Download className="mr-1 h-3.5 w-3.5" /> Trigger backup
                </Button>
                <Button variant="outline" size="sm" disabled={!isAdmin}>
                  <Upload className="mr-1 h-3.5 w-3.5" /> Test restore
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OperatorsTab({ canManage }: { canManage: boolean }) {
  const { data, isLoading, isError, refetch } = useOperators()
  const create = useCreateOperator()
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [display, setDisplay] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('VIEWER')

  const submit = () => {
    if (!username || !display || password.length < 8) {
      toast.error('Username, display name, and an 8+ char password are required.')
      return
    }
    create.mutate(
      { username, display_name: display, password, role },
      {
        onSuccess: () => {
          toast.success(`Operator ${username} created.`)
          setOpen(false)
          setUsername('')
          setDisplay('')
          setPassword('')
          setRole('VIEWER')
        },
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Failed'),
      },
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-muted-foreground" /> Operators
            {data && <span className="text-xs font-normal text-muted-foreground">· {data.operators.length}</span>}
          </CardTitle>
          <CardDescription className="mt-1 text-xs">Role-based access. All actions are audited.</CardDescription>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setUsername(''); setDisplay(''); setPassword('') } }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Add operator</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create operator</DialogTitle>
                <DialogDescription>New operator will be active immediately. Password is bcrypt-hashed.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="op-user" className="text-xs">Username</Label>
                  <Input id="op-user" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="e.g. dispatcher2" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="op-name" className="text-xs">Display name</Label>
                  <Input id="op-name" value={display} onChange={(e) => setDisplay(e.target.value)} placeholder="e.g. Jordan Lee" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="op-pass" className="text-xs">Password (min 8 chars)</Label>
                  <Input id="op-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIEWER">Viewer</SelectItem>
                      <SelectItem value="DISPATCHER">Dispatcher</SelectItem>
                      <SelectItem value="FIELD_COORDINATOR">Field Coordinator</SelectItem>
                      <SelectItem value="NODE_TECHNICIAN">Node Technician</SelectItem>
                      <SelectItem value="ADMINISTRATOR">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit} disabled={create.isPending}>
                  {create.isPending ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Creating…</> : 'Create operator'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : isError ? (
          <ErrorState title="Could not load operators" onRetry={() => refetch()} className="m-6" />
        ) : !data || data.operators.length === 0 ? (
          <EmptyState title="No operators" className="py-8" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Username</th>
                  <th className="px-3 py-2.5 text-left font-medium">Display name</th>
                  <th className="px-3 py-2.5 text-left font-medium">Role</th>
                  <th className="px-3 py-2.5 text-left font-medium">Status</th>
                  <th className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Sessions</th>
                  <th className="px-4 py-2.5 text-right font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.operators.map((op) => (
                  <tr key={op.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{op.username}</td>
                    <td className="px-3 py-3">{op.display_name}</td>
                    <td className="px-3 py-3">
                      <StatusBadge
                        tone={
                          op.role === 'ADMINISTRATOR' ? 'danger' :
                          op.role === 'DISPATCHER' ? 'info' :
                          op.role === 'NODE_TECHNICIAN' ? 'warning' :
                          op.role === 'FIELD_COORDINATOR' ? 'info' : 'muted'
                        }
                        label={titleCase(op.role)}
                        size="sm"
                      />
                    </td>
                    <td className="px-3 py-3">
                      {op.active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" /> Active
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Disabled</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 text-xs tabular-nums text-muted-foreground sm:table-cell">{op.active_sessions}</td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">{formatDateTime(op.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ThresholdRow({ label, value, canManage }: { label: string; value: number; canManage: boolean }) {
  const [val, setVal] = useState(String(value))
  const unit = label.includes('seconds') ? 's' : label.includes('days') ? 'd' : label.includes('bytes') ? 'B' : label.includes('meters') ? 'm' : ''
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5">
      <div>
        <div className="font-mono text-xs font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">current: {value}{unit}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={!canManage}
          className="h-8 w-24 text-xs"
        />
        <span className="text-[10px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
}

function GatewayMetric({ icon, label, value, tone, small }: { icon: React.ReactNode; label: string; value: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'muted'; small?: boolean }) {
  return (
    <Card>
      <CardContent className="p-3.5">
        <div className="flex items-center gap-2">
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-md', {
            'bg-success/10 text-success': tone === 'success',
            'bg-warning/15 text-warning-foreground': tone === 'warning',
            'bg-danger/10 text-danger': tone === 'danger',
            'bg-info/10 text-info': tone === 'info',
            'bg-muted text-muted-foreground': tone === 'muted',
          })}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={cn('truncate font-semibold', small ? 'text-sm' : 'text-base')}>{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
