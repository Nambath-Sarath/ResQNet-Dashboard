'use client'

import { useState } from 'react'
import { useMessages, useCreateMessage } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
import {
  MessageSquare,
  Send,
  Search,
  Radio,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo, formatDateTime } from '@/lib/format'
import { toast } from 'sonner'
import { ApiRequestError } from '@/lib/api-client'

const STATUS_LABELS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'muted'; icon: typeof CheckCircle2 }> = {
  CREATED: { label: 'Created', tone: 'muted', icon: Clock },
  ACCEPTED_BY_GATEWAY: { label: 'Gateway accepted', tone: 'info', icon: CheckCircle2 },
  QUEUED_FOR_NODE: { label: 'Queued for node', tone: 'warning', icon: Clock },
  FORWARDED: { label: 'Forwarded', tone: 'info', icon: Radio },
  ACKNOWLEDGED: { label: 'Acknowledged', tone: 'success', icon: CheckCircle2 },
  FAILED: { label: 'Failed', tone: 'danger', icon: XCircle },
  EXPIRED: { label: 'Expired', tone: 'muted', icon: AlertTriangle },
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'ACCEPTED_BY_GATEWAY', label: 'Accepted' },
  { value: 'QUEUED_FOR_NODE', label: 'Queued' },
  { value: 'FORWARDED', label: 'Forwarded' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'EXPIRED', label: 'Expired' },
]

export function MessagesPage() {
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const { data, isLoading, isError, refetch } = useMessages({
    status: status !== 'all' ? status : undefined,
    q: q || undefined,
  })
  const create = useCreateMessage()
  const setView = useAppStore((s) => s.setView)
  const [destination, setDestination] = useState('broadcast')
  const [body, setBody] = useState('')
  const [messageType, setMessageType] = useState('text')

  const submit = () => {
    if (!destination.trim() || !body.trim()) {
      toast.error('Destination and body are required.')
      return
    }
    create.mutate(
      { destination: destination.trim(), body: body.trim(), message_type: messageType },
      {
        onSuccess: () => {
          toast.success('Message accepted by gateway.')
          setOpen(false)
          setBody('')
        },
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Failed.'),
      },
    )
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search body or destination…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-0.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors',
                status === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setBody('') }}>
          <DialogTrigger asChild>
            <Button size="sm" className="ml-auto">
              <Plus className="mr-1 h-4 w-4" /> Compose
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Compose message</DialogTitle>
              <DialogDescription>
                Gateway-accepted only. Destination acknowledgement is a separate state. Max 4096 chars.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="msg-dest" className="text-xs">Destination (node ID or "broadcast")</Label>
                <Input id="msg-dest" value={destination} onChange={(e) => setDestination(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="msg-type" className="text-xs">Type</Label>
                <div className="flex gap-2">
                  {['text', 'alert', 'broadcast'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setMessageType(t)}
                      className={cn(
                        'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                        messageType === t ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="msg-body" className="text-xs">Body</Label>
                <Textarea
                  id="msg-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  placeholder="Type your message…"
                  maxLength={4096}
                />
                <div className="text-right text-[10px] text-muted-foreground">{body.length}/4096</div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={create.isPending || !body.trim() || !destination.trim()}>
                {create.isPending ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Sending…</> : <><Send className="mr-1 h-3.5 w-3.5" /> Send</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Delivery semantics info */}
      <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 p-2.5 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
        <span>
          <strong>Gateway accepted</strong> means the Pi persisted the message — it does not mean
          the destination node received or acknowledged it. Each state (queued, forwarded, acknowledged)
          is tracked separately per spec §6.7.
        </span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Messages
            {data && <span className="text-xs font-normal text-muted-foreground">· {data.total}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingSkeleton rows={6} />
          ) : isError ? (
            <ErrorState title="Could not load messages" onRetry={() => refetch()} className="m-6" />
          ) : !data || data.messages.length === 0 ? (
            <EmptyState title="No messages" description="Compose a message or broadcast to see it here." icon={<MessageSquare className="h-6 w-6" />} className="py-12" />
          ) : (
            <ul className="divide-y divide-border">
              {data.messages.map((m) => {
                const st = STATUS_LABELS[m.status] ?? { label: m.status, tone: 'muted' as const, icon: Clock }
                const Icon = st.icon
                return (
                  <li key={m.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md', {
                        'bg-success/10 text-success': st.tone === 'success',
                        'bg-warning/15 text-warning-foreground': st.tone === 'warning',
                        'bg-danger/10 text-danger': st.tone === 'danger',
                        'bg-info/10 text-info': st.tone === 'info',
                        'bg-muted text-muted-foreground': st.tone === 'muted',
                      })}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{m.destination}</span>
                          <StatusBadge tone={st.tone} label={st.label} size="sm" />
                          <span className="text-[10px] text-muted-foreground">{m.message_type}</span>
                        </div>
                        <p className="mt-1 text-sm text-foreground/90">{m.body}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" /> {timeAgo(m.created_at)}
                          </span>
                          {m.accepted_at && <span>accepted {timeAgo(m.accepted_at)}</span>}
                          {m.forwarded_at && <span>forwarded {timeAgo(m.forwarded_at)}</span>}
                          {m.acknowledged_at && <span>acknowledged {timeAgo(m.acknowledged_at)}</span>}
                          {m.failure_reason && <span className="text-danger">reason: {m.failure_reason}</span>}
                          {m.expires_at && <span>expires {formatDateTime(m.expires_at)}</span>}
                        </div>
                        {m.attempts && m.attempts.length > 0 && (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                              {m.attempts.length} attempt(s)
                            </summary>
                            <ul className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                              {m.attempts.map((a) => (
                                <li key={a.id} className="flex items-center gap-2">
                                  <span className={cn('h-1.5 w-1.5 rounded-full', a.outcome === 'success' ? 'bg-success' : a.outcome === 'failed' ? 'bg-danger' : 'bg-warning')} />
                                  {a.outcome} · {timeAgo(a.attempted_at)} {a.error_code ? `(${a.error_code})` : ''}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
