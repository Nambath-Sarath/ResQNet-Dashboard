'use client'

import { useState } from 'react'
import { useBatchIncidentAction, useOperators } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
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
import { CheckCircle2, UserPlus, XCircle, X, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { ApiRequestError } from '@/lib/api-client'

type Props = {
  selectedIds: string[]
  onClear: () => void
  onComplete: () => void
}

/**
 * Floating batch action bar — appears when incidents are selected in the queue.
 * Provides Acknowledge / Assign / Cancel actions that apply to all selected.
 */
export function BatchActionBar({ selectedIds, onClear, onComplete }: Props) {
  const batch = useBatchIncidentAction()
  const { data: operatorsData } = useOperators()
  const [assignOpen, setAssignOpen] = useState(false)
  const [assigneeId, setAssigneeId] = useState('')
  const [note, setNote] = useState('')

  const count = selectedIds.length

  const runBatch = (action: 'acknowledge' | 'assign' | 'cancel', assigneeId?: string, note?: string) => {
    batch.mutate(
      {
        action,
        incident_ids: selectedIds,
        assignee_id: assigneeId,
        note,
      },
      {
        onSuccess: (r) => {
          const verb = action === 'acknowledge' ? 'acknowledged' : action === 'cancel' ? 'cancelled' : 'assigned'
          if (r.failed === 0) {
            toast.success(`Batch ${verb}: ${r.succeeded}/${r.total} incident(s) updated.`)
          } else {
            toast.warning(`Batch ${verb}: ${r.succeeded} succeeded, ${r.failed} failed.`, {
              description: r.results.filter((x) => !x.ok).map((x) => `${x.incident_id}: ${x.error}`).join('; ').slice(0, 200),
            })
          }
          onComplete()
          setAssignOpen(false)
          setNote('')
          setAssigneeId('')
        },
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Batch failed'),
      },
    )
  }

  return (
    <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 shadow-md backdrop-blur">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Users className="h-4 w-4 text-primary" />
        {count} selected
      </div>

      <div className="ml-2 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => runBatch('acknowledge')}
          disabled={batch.isPending}
          className="border-info/40 text-info hover:bg-info/10"
        >
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Acknowledge all
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setAssignOpen(true)}
          disabled={batch.isPending}
        >
          <UserPlus className="mr-1 h-3.5 w-3.5" /> Assign all
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="border-danger/40 text-danger hover:bg-danger/10"
              disabled={batch.isPending}
            >
              <XCircle className="mr-1 h-3.5 w-3.5" /> Cancel all
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel {count} incident(s)?</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark all {count} selected incidents as CANCELLED (not resolved). The action
                is recorded in the audit trail per incident and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep them</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => runBatch('cancel')}
                className="bg-danger text-danger-foreground hover:bg-danger/90"
              >
                Cancel {count} incident(s)
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {batch.isPending && (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Processing…
        </span>
      )}

      <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto">
        <X className="h-3.5 w-3.5" /> Clear
      </Button>

      {/* Assign dialog */}
      <Dialog open={assignOpen} onOpenChange={(o) => { setAssignOpen(o); if (!o) { setNote(''); setAssigneeId('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {count} incident(s)</DialogTitle>
            <DialogDescription>
              All selected incidents will be assigned to the chosen operator. Incidents in ACKNOWLEDGED
              status will move to ASSIGNED; others keep their status but get the assignee.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Assign to</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an operator" />
                </SelectTrigger>
                <SelectContent>
                  {operatorsData?.operators
                    .filter((o) => o.active)
                    .map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.display_name} ({o.role.toLowerCase()})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-note" className="text-xs">Note (optional)</Label>
              <Textarea
                id="batch-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Assigning to field team for riverside sector."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={() => runBatch('assign', assigneeId, note)} disabled={!assigneeId || batch.isPending}>
              {batch.isPending ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Assigning…</> : <><UserPlus className="mr-1 h-3.5 w-3.5" /> Assign {count}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
