'use client'

import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, Inbox, Lock, FileWarning } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReactNode } from 'react'

export function LoadingState({ message = 'Loading…', className }: { message?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 p-6 text-sm text-muted-foreground', className)}>
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      {message}
    </div>
  )
}

export function LoadingSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2 p-4', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

export function EmptyState({
  title = 'No records',
  description,
  icon,
  action,
  className,
}: {
  title?: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 p-10 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className,
}: {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 p-8 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertCircle className="h-6 w-6" />
      </div>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function ForbiddenState({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 p-8 text-center', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
        <Lock className="h-6 w-6" />
      </div>
      <div>
        <p className="font-medium text-foreground">Insufficient permissions</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your role cannot access this data. Contact an administrator.
        </p>
      </div>
    </div>
  )
}

export function StaleDataState({
  lastUpdated,
  className,
}: {
  lastUpdated: string | null
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2 p-3 text-sm text-warning-foreground', className)}>
      <FileWarning className="h-4 w-4 shrink-0" />
      <span>
        Showing cached data from{' '}
        <span className="font-medium tabular-nums">
          {lastUpdated ? new Date(lastUpdated).toLocaleString() : 'earlier'}
        </span>
        . The gateway may be unreachable. Reconnect will retry automatically.
      </span>
    </div>
  )
}
