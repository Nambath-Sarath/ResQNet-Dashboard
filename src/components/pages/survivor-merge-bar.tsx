'use client'

import { useState } from 'react'
import { useMergeSurvivor } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { GitMerge, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ApiRequestError } from '@/lib/api-client'

type Survivor = {
  id: string
  temporary_ref: string
  display_name: string | null
  status: string
  last_seen_at: string
}

type Props = {
  selected: Survivor[]
  onClear: () => void
  onComplete: () => void
}

/**
 * Survivor merge bar — appears when exactly 2 survivors are selected.
 * The first-selected is the canonical; the second is merged into it.
 */
export function SurvivorMergeBar({ selected, onClear, onComplete }: Props) {
  const merge = useMergeSurvivor()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  if (selected.length !== 2) return null

  const [canonical, duplicate] = selected

  const runMerge = () => {
    merge.mutate(
      { canonicalId: canonical.id, duplicateId: duplicate.id, note: note || undefined },
      {
        onSuccess: (r) => {
          toast.success(`Merged ${r.duplicate_ref} into ${r.canonical_ref}.`, { description: r.note })
          setOpen(false)
          setNote('')
          onComplete()
        },
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Merge failed'),
      },
    )
  }

  return (
    <>
      <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 shadow-md backdrop-blur">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <GitMerge className="h-4 w-4 text-primary" />
          2 survivors selected for merge
        </div>
        <div className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="rounded bg-success/15 px-1.5 py-0.5 font-mono text-success">
            canonical: {canonical.temporary_ref}
          </span>
          <GitMerge className="h-3 w-3" />
          <span className="rounded bg-danger/15 px-1.5 py-0.5 font-mono text-danger">
            duplicate: {duplicate.temporary_ref}
          </span>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} disabled={merge.isPending} className="ml-2">
          <GitMerge className="mr-1 h-3.5 w-3.5" /> Merge
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto">
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setNote('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5" />
              Merge {duplicate.temporary_ref} into {canonical.temporary_ref}
            </DialogTitle>
            <DialogDescription>
              The duplicate survivor will be marked as closed and linked to the canonical record.
              The canonical's notes will be appended with the duplicate's notes + this merge note.
              This action is recorded in the audit trail and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-success/30 bg-success/5 p-2.5 text-xs">
                <div className="mb-1 font-medium text-success">Canonical (kept)</div>
                <div className="font-mono">{canonical.temporary_ref}</div>
                <div className="text-muted-foreground">{canonical.display_name ?? '—'}</div>
                <div className="text-[10px] text-muted-foreground">{canonical.status}</div>
              </div>
              <div className="rounded-md border border-danger/30 bg-danger/5 p-2.5 text-xs">
                <div className="mb-1 font-medium text-danger">Duplicate (closed)</div>
                <div className="font-mono">{duplicate.temporary_ref}</div>
                <div className="text-muted-foreground">{duplicate.display_name ?? '—'}</div>
                <div className="text-[10px] text-muted-foreground">{duplicate.status}</div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="surv-merge-note" className="text-xs">Merge note (optional)</Label>
              <Textarea
                id="surv-merge-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Same person — confirmed by field team."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setNote('') }}>Cancel</Button>
            <Button onClick={runMerge} disabled={merge.isPending}>
              {merge.isPending ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Merging…</> : <><GitMerge className="mr-1 h-3.5 w-3.5" /> Merge survivor</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
