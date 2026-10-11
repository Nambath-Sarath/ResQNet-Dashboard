'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted'

const toneClasses: Record<Tone, string> = {
  success: 'bg-success/12 text-success border-success/30',
  warning: 'bg-warning/15 text-warning-foreground border-warning/40',
  danger: 'bg-danger/12 text-danger border-danger/30',
  info: 'bg-info/12 text-info border-info/30',
  muted: 'bg-muted text-muted-foreground border-border',
}

const dotClasses: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  muted: 'bg-muted-foreground/60',
}

export function StatusBadge({
  tone,
  label,
  icon,
  pulse,
  className,
  size = 'md',
}: {
  tone: Tone
  label: ReactNode
  icon?: ReactNode
  pulse?: boolean
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap',
        toneClasses[tone],
        size === 'sm' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block rounded-full',
          size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2',
          dotClasses[tone],
          pulse && 'animate-pulse-dot',
        )}
        aria-hidden
      />
      {icon}
      <span>{label}</span>
    </span>
  )
}

export function StatusDot({
  tone,
  pulse,
  className,
}: {
  tone: Tone
  pulse?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-block h-2.5 w-2.5 rounded-full',
        dotClasses[tone],
        pulse && 'animate-pulse-dot',
        className,
      )}
      aria-hidden
    />
  )
}
