'use client'

import { useIncidentDetail } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { Printer, ArrowLeft, Loader2 } from 'lucide-react'
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  titleCase,
  formatDateTime,
  formatCoord,
  timeAgo,
} from '@/lib/format'

/**
 * Printable incident report — a stripped-down, print-friendly layout.
 * Opens in a dialog with a "Print" button that triggers window.print().
 */
export function PrintableIncidentReport({ incidentId }: { incidentId: string }) {
  const { data: incident, isLoading } = useIncidentDetail(incidentId)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading incident…
      </div>
    )
  }
  if (!incident) return null

  const cat = CATEGORY_LABELS[incident.category] ?? { label: incident.category, short: '—' }
  const pri = PRIORITY_LABELS[incident.priority] ?? { label: incident.priority, tone: 'muted' }
  const st = STATUS_LABELS[incident.status] ?? { label: incident.status, tone: 'muted' }

  return (
    <div className="bg-background">
      {/* Screen-only header with print button */}
      <div className="no-print flex items-center justify-between border-b p-4">
        <div className="text-sm text-muted-foreground">Print preview — {incident.id}</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-3.5 w-3.5" /> Print
          </Button>
        </div>
      </div>

      {/* Printable document */}
      <div className="mx-auto max-w-2xl p-8 text-sm print:p-0">
        {/* Header */}
        <div className="mb-6 border-b-2 border-foreground pb-3">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">ResQNet Incident Report</h1>
              <p className="text-xs text-muted-foreground">Local-first disaster response platform</p>
            </div>
            <div className="text-right text-xs">
              <div className="font-mono text-lg font-bold">{incident.id}</div>
              <div>Generated {formatDateTime(new Date().toISOString())}</div>
            </div>
          </div>
        </div>

        {/* Status summary */}
        <div className="mb-6 grid grid-cols-4 gap-3">
          <div className="rounded border p-2">
            <div className="text-[10px] uppercase text-muted-foreground">Status</div>
            <div className="font-semibold">{st.label}</div>
          </div>
          <div className="rounded border p-2">
            <div className="text-[10px] uppercase text-muted-foreground">Priority</div>
            <div className="font-semibold">{pri.label}</div>
          </div>
          <div className="rounded border p-2">
            <div className="text-[10px] uppercase text-muted-foreground">Category</div>
            <div className="font-semibold">{cat.label}</div>
          </div>
          <div className="rounded border p-2">
            <div className="text-[10px] uppercase text-muted-foreground">People</div>
            <div className="font-semibold tabular-nums">{incident.people_affected ?? '—'}</div>
          </div>
        </div>

        {/* Description */}
        <div className="mb-6">
          <h2 className="mb-1.5 text-sm font-semibold uppercase text-muted-foreground">Description</h2>
          <p className="text-base">{incident.description}</p>
        </div>

        {/* Location */}
        {incident.location_lat != null && (
          <div className="mb-6">
            <h2 className="mb-1.5 text-sm font-semibold uppercase text-muted-foreground">Reported location</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Coordinates: </span>
                <span className="font-mono">{formatCoord(incident.location_lat, incident.location_lon)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Source: </span>
                {titleCase(incident.location_source)}
              </div>
              <div>
                <span className="text-muted-foreground">Accuracy: </span>
                <span className="tabular-nums">
                  {incident.location_accuracy_m != null ? `±${incident.location_accuracy_m} m` : '—'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Captured: </span>
                <span className="tabular-nums">{formatDateTime(incident.location_captured_at)}</span>
              </div>
            </div>
            <p className="mt-1.5 text-[10px] italic text-muted-foreground">
              Note: A node-associated SOS does not equal a survivor's exact position. Treat as approximate until confirmed.
            </p>
          </div>
        )}

        {/* Timeline */}
        <div className="mb-6">
          <h2 className="mb-1.5 text-sm font-semibold uppercase text-muted-foreground">Timeline</h2>
          <table className="w-full text-xs">
            <thead className="border-b">
              <tr>
                <th className="py-1 text-left font-medium">Event</th>
                <th className="py-1 text-left font-medium">Change</th>
                <th className="py-1 text-left font-medium">By</th>
                <th className="py-1 text-right font-medium">At</th>
              </tr>
            </thead>
            <tbody>
              {incident.events.map((e) => (
                <tr key={e.id} className="border-b border-border/40">
                  <td className="py-1.5">{titleCase(e.event_type.replace(/_/g, ' '))}</td>
                  <td className="py-1.5 font-mono">
                    {e.old_value && e.new_value ? `${e.old_value} → ${e.new_value}` : e.new_value ?? '—'}
                  </td>
                  <td className="py-1.5 font-mono">{e.actor_type}{e.actor_id ? `:${e.actor_id.slice(-6)}` : ''}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatDateTime(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Metadata */}
        <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          <div><span className="text-muted-foreground">Source type: </span>{titleCase(incident.source_type)}</div>
          {incident.source_node && (
            <div><span className="text-muted-foreground">Source node: </span>{incident.source_node.id} ({incident.source_node.display_name})</div>
          )}
          {incident.client_submission_id && (
            <div><span className="text-muted-foreground">Submission ID: </span><span className="font-mono">{incident.client_submission_id}</span></div>
          )}
          {incident.assigned_to && (
            <div><span className="text-muted-foreground">Assigned to: </span>{incident.assigned_to.display_name} ({titleCase(incident.assigned_to.role)})</div>
          )}
          <div><span className="text-muted-foreground">Created: </span><span className="tabular-nums">{formatDateTime(incident.created_at)}</span></div>
          {incident.acknowledged_at && (
            <div><span className="text-muted-foreground">Acknowledged: </span><span className="tabular-nums">{formatDateTime(incident.acknowledged_at)}</span></div>
          )}
          {incident.resolved_at && (
            <div><span className="text-muted-foreground">Resolved: </span><span className="tabular-nums">{formatDateTime(incident.resolved_at)}</span></div>
          )}
        </div>

        {/* Notes */}
        {incident.notes.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-1.5 text-sm font-semibold uppercase text-muted-foreground">Operator notes</h2>
            <ul className="space-y-1.5 text-xs">
              {incident.notes.map((n) => (
                <li key={n.id} className="border-l-2 border-border pl-2">
                  <p>{n.body}</p>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {n.author?.display_name ?? 'Operator'} · {formatDateTime(n.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 border-t pt-3 text-[10px] text-muted-foreground">
          <p>
            This report was generated by the ResQNet Command Dashboard. Data is authoritative as of
            {' '}{formatDateTime(new Date().toISOString())}. Delivery state: gateway-accepted does not
            imply field-team acknowledgement.
          </p>
        </div>
      </div>
    </div>
  )
}
