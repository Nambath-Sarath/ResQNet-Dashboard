'use client'

import { useState } from 'react'
import {
  useIncidentDetail,
  useAcknowledgeIncident,
  useAdvanceIncident,
  useAddNote,
} from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { StatusBadge } from '@/components/shared/status-badge'
import { FreshnessLabel } from '@/components/shared/freshness-label'
import { LoadingSkeleton, ErrorState, EmptyState } from '@/components/shared/state-views'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Siren,
  Clock,
  Users,
  ShieldCheck,
  MapPin,
  History,
  StickyNote,
  Radio,
  CheckCircle2,
  PlayCircle,
  XCircle,
  AlertTriangle,
  Plus,
  Send,
  Navigation,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  titleCase,
  timeAgo,
  formatDateTime,
  formatCoord,
} from '@/lib/format'

const STATUS_TRANSITIONS: Record<
  string,
  {
    value: string
    label: string
    icon: typeof CheckCircle2
    tone: 'success' | 'info' | 'warning' | 'danger'
    destructive?: boolean
  }[]
> = {
  NEW: [{ value: 'ACKNOWLEDGED', label: 'Acknowledge', icon: CheckCircle2, tone: 'info' }],
  ACKNOWLEDGED: [{ value: 'IN_PROGRESS', label: 'Start work', icon: PlayCircle, tone: 'info' }],
  ASSIGNED: [{ value: 'IN_PROGRESS', label: 'Start work', icon: PlayCircle, tone: 'info' }],
  IN_PROGRESS: [
    { value: 'RESOLVED', label: 'Resolve', icon: CheckCircle2, tone: 'success' },
    { value: 'CANCELLED', label: 'Cancel', icon: XCircle, tone: 'danger', destructive: true },
  ],
}

export function IncidentDetailPage({ incidentId }: { incidentId: string }) {
  const setView = useAppStore((s) => s.setView)
  const { data: incident, isLoading, isError, refetch } = useIncidentDetail(incidentId)
  const ack = useAcknowledgeIncident()
  const advance = useAdvanceIncident()
  const addNote = useAddNote()
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteBody, setNoteBody] = useState('')

  const submitNote = () => {
    if (!noteBody.trim()) return
    addNote.mutate(
      { incidentId, body: noteBody.trim() },
      {
        onSuccess: () => {
          toast.success('Note added.')
          setNoteBody('')
          setNoteOpen(false)
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  if (isLoading) return <LoadingSkeleton rows={6} className="m-6" />
  if (isError)
    return (
      <ErrorState
        title="Could not load incident"
        description="The incident may not exist or the gateway is unreachable."
        onRetry={() => refetch()}
        className="m-6"
      />
    )
  if (!incident) return <EmptyState title="Incident not found" className="m-6" />

  const cat = CATEGORY_LABELS[incident.category] ?? { label: incident.category, short: '—' }
  const pri = PRIORITY_LABELS[incident.priority] ?? { label: incident.priority, tone: 'muted' }
  const st = STATUS_LABELS[incident.status] ?? { label: incident.status, tone: 'muted' }
  const transitions = STATUS_TRANSITIONS[incident.status] ?? []

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView({ name: 'incidents' })}
          className="text-muted-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Queue
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-xl font-semibold tracking-tight">{incident.id}</h2>
            <StatusBadge tone={pri.tone} label={pri.label} />
            <StatusBadge tone={st.tone} label={st.label} pulse={incident.status === 'NEW'} />
            <StatusBadge tone="muted" label={cat.label} icon={<Siren className="h-3 w-3" />} />
          </div>
          <p className="mt-1.5 text-sm text-foreground/90">{incident.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> Created {timeAgo(incident.created_at)}
            </span>
            {incident.people_affected != null && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> {incident.people_affected} affected
              </span>
            )}
            {incident.source_node && (
              <span className="inline-flex items-center gap-1">
                <Radio className="h-3 w-3" /> {incident.source_node.id} (
                {incident.source_node.display_name})
              </span>
            )}
            {incident.location_lat != null && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span className="font-mono">
                  {formatCoord(incident.location_lat, incident.location_lon)}
                </span>
              </span>
            )}
            {incident.assigned_to && (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> {incident.assigned_to.display_name}
              </span>
            )}
          </div>
        </div>
        <FreshnessLabel timestamp={incident.updated_at} label="Updated" />
      </div>

      {/* Action bar */}
      {transitions.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-xs font-medium text-muted-foreground">Next actions:</span>
            {transitions.map((t) => {
              const Icon = t.icon
              if (t.destructive) {
                return (
                  <AlertDialog key={t.value}>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-danger/40 text-danger hover:bg-danger/10"
                      >
                        <Icon className="mr-1 h-3.5 w-3.5" /> {t.label}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel incident {incident.id}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action is recorded in the audit trail and cannot be undone. The
                          incident will be marked as cancelled, not resolved.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep open</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            advance.mutate(
                              { incidentId, status: t.value },
                              {
                                onSuccess: () =>
                                  toast.success(`Incident ${incident.id} cancelled.`),
                                onError: (e) => toast.error(e.message),
                              },
                            )
                          }
                          className="bg-danger text-danger-foreground hover:bg-danger/90"
                        >
                          Cancel incident
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )
              }
              return (
                <Button
                  key={t.value}
                  size="sm"
                  variant={t.tone === 'success' ? 'default' : 'outline'}
                  disabled={ack.isPending || advance.isPending}
                  onClick={() =>
                    advance.mutate(
                      { incidentId, status: t.value },
                      {
                        onSuccess: () =>
                          toast.success(
                            t.value === 'RESOLVED'
                              ? `Incident ${incident.id} resolved.`
                              : `Incident ${incident.id} advanced to ${titleCase(t.value)}.`,
                          ),
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  <Icon className="mr-1 h-3.5 w-3.5" /> {t.label}
                </Button>
              )
            })}
            {incident.status === 'NEW' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  ack.mutate(incidentId, {
                    onSuccess: () => toast.success(`Acknowledged ${incident.id}.`),
                    onError: (e) => toast.error(e.message),
                  })
                }
                disabled={ack.isPending}
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Acknowledge
              </Button>
            )}
            <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add note
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add note to {incident.id}</DialogTitle>
                  <DialogDescription>
                    Notes are timestamped and visible to other operators. They are recorded in the
                    incident history.
                  </DialogDescription>
                </DialogHeader>
                <Textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="e.g. Field team confirms 2 people evacuated to Shelter Delta."
                  rows={4}
                />
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNoteOpen(false)
                      setNoteBody('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button disabled={!noteBody.trim() || addNote.isPending} onClick={submitNote}>
                    <Send className="mr-1 h-3.5 w-3.5" /> Save note
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column: details */}
        <div className="space-y-4 lg:col-span-2">
          {/* Location */}
          {incident.location_lat != null && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Navigation className="h-4 w-4 text-muted-foreground" /> Reported location
                </CardTitle>
                <CardDescription className="text-xs">
                  Source: {titleCase(incident.location_source)} · accuracy{' '}
                  {incident.location_accuracy_m != null
                    ? `±${incident.location_accuracy_m} m`
                    : 'unknown'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Coordinates</span>
                  <span className="font-mono text-xs">
                    {formatCoord(incident.location_lat, incident.location_lon)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Captured at</span>
                  <span className="tabular-nums text-xs">
                    {formatDateTime(incident.location_captured_at)}
                  </span>
                </div>
                <div className="mt-2 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    A node-associated SOS does not equal a survivor's exact position. Treat this
                    location as approximate until confirmed by a field team.
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4 text-muted-foreground" /> Incident timeline
              </CardTitle>
              <CardDescription className="text-xs">
                Append-only history of state changes.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ol className="relative">
                {incident.events.map((e, i) => (
                  <li key={e.id} className="relative flex gap-3 px-4 py-3 text-sm last:pb-3">
                    {i < incident.events.length - 1 && (
                      <span className="absolute left-[1.4rem] top-0 h-full w-px bg-border" />
                    )}
                    <div
                      className={cn(
                        'relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-card',
                        e.event_type === 'resolved'
                          ? 'border-success/40 text-success'
                          : e.event_type === 'cancelled'
                            ? 'border-danger/40 text-danger'
                            : e.event_type === 'created'
                              ? 'border-info/40 text-info'
                              : 'border-border text-muted-foreground',
                      )}
                    >
                      <EventIcon type={e.event_type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {titleCase(e.event_type.replace(/_/g, ' '))}
                        </span>
                        {e.old_value && e.new_value && (
                          <span className="text-xs text-muted-foreground">
                            <span className="font-mono">{e.old_value}</span> →{' '}
                            <span className="font-mono">{e.new_value}</span>
                          </span>
                        )}
                      </div>
                      {e.note && <p className="mt-0.5 text-xs text-muted-foreground">{e.note}</p>}
                      <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                        {formatDateTime(e.created_at)} · by{' '}
                        <span className="font-mono">
                          {e.actor_type}
                          {e.actor_id ? `:${e.actor_id.slice(-6)}` : ''}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <StickyNote className="h-4 w-4 text-muted-foreground" /> Operator notes
              </CardTitle>
              <CardDescription className="text-xs">{incident.notes.length} note(s)</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {incident.notes.length === 0 ? (
                <EmptyState
                  title="No notes yet"
                  description="Add context, field observations, or handover information."
                  className="py-6"
                />
              ) : (
                <ul className="divide-y divide-border">
                  {incident.notes.map((n) => (
                    <li key={n.id} className="px-4 py-3">
                      <p className="text-sm">{n.body}</p>
                      <div className="mt-1.5 text-[10px] text-muted-foreground">
                        {n.author?.display_name ?? 'Operator'} ·{' '}
                        <span className="tabular-nums">{formatDateTime(n.created_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: meta + delivery */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Incident metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <MetaRow label="Status">
                <StatusBadge tone={st.tone} label={st.label} size="sm" />
              </MetaRow>
              <MetaRow label="Priority">
                <StatusBadge tone={pri.tone} label={pri.label} size="sm" />
              </MetaRow>
              <MetaRow label="Category">{cat.label}</MetaRow>
              <MetaRow label="People affected">
                <span className="tabular-nums">{incident.people_affected ?? '—'}</span>
              </MetaRow>
              <MetaRow label="Source">{titleCase(incident.source_type)}</MetaRow>
              {incident.source_node && (
                <MetaRow label="Source node">
                  <span className="font-mono text-xs">{incident.source_node.id}</span>
                </MetaRow>
              )}
              {incident.client_submission_id && (
                <MetaRow label="Submission ID">
                  <span className="font-mono text-xs">{incident.client_submission_id}</span>
                </MetaRow>
              )}
              <MetaRow label="Assigned to">
                {incident.assigned_to ? (
                  <span className="text-xs">
                    {incident.assigned_to.display_name}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({titleCase(incident.assigned_to.role)})
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-warning-foreground">Unassigned</span>
                )}
              </MetaRow>
              <MetaRow label="Created">
                <span className="tabular-nums text-xs">{formatDateTime(incident.created_at)}</span>
              </MetaRow>
              {incident.acknowledged_at && (
                <MetaRow label="Acknowledged">
                  <span className="tabular-nums text-xs">
                    {formatDateTime(incident.acknowledged_at)}
                  </span>
                </MetaRow>
              )}
              {incident.assigned_at && (
                <MetaRow label="Assigned at">
                  <span className="tabular-nums text-xs">{formatDateTime(incident.assigned_at)}</span>
                </MetaRow>
              )}
              {incident.resolved_at && (
                <MetaRow label="Resolved">
                  <span className="tabular-nums text-xs">{formatDateTime(incident.resolved_at)}</span>
                </MetaRow>
              )}
            </CardContent>
          </Card>

          {/* Delivery semantics */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning-foreground" />
                Delivery state
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                <span>
                  <span className="font-medium text-foreground">Gateway accepted.</span> The Pi has
                  persisted this record.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium text-foreground">Forwarding</span> to field teams
                  depends on node reachability.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium text-foreground">Acknowledgement</span> by a field
                  team is a separate state — not implied here.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

function EventIcon({ type }: { type: string }) {
  switch (type) {
    case 'created':
      return <Siren className="h-3 w-3" />
    case 'acknowledged':
      return <CheckCircle2 className="h-3 w-3" />
    case 'assigned':
      return <Users className="h-3 w-3" />
    case 'status_changed':
      return <PlayCircle className="h-3 w-3" />
    case 'resolved':
      return <CheckCircle2 className="h-3 w-3" />
    case 'cancelled':
      return <XCircle className="h-3 w-3" />
    case 'note_added':
      return <StickyNote className="h-3 w-3" />
    case 'priority_changed':
      return <AlertTriangle className="h-3 w-3" />
    default:
      return <History className="h-3 w-3" />
  }
}
