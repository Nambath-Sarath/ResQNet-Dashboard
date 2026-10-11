'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Keyboard, Search, CornerDownLeft, ArrowUpDown, Bell, Volume2 } from 'lucide-react'

type Shortcut = {
  keys: string[]
  label: string
  category: 'Navigation' | 'Search' | 'Actions'
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['⌘', 'K'], label: 'Open command palette / global search', category: 'Search' },
  { keys: ['↑', '↓'], label: 'Navigate search results', category: 'Search' },
  { keys: ['↵'], label: 'Select / open result', category: 'Search' },
  { keys: ['Esc'], label: 'Close dialog / palette', category: 'Navigation' },
  { keys: ['g', 'o'], label: 'Go to Overview', category: 'Navigation' },
  { keys: ['g', 'm'], label: 'Go to Situation Map', category: 'Navigation' },
  { keys: ['g', 'i'], label: 'Go to Incidents', category: 'Navigation' },
  { keys: ['g', 's'], label: 'Go to Survivors', category: 'Navigation' },
  { keys: ['g', 'n'], label: 'Go to Nodes', category: 'Navigation' },
  { keys: ['g', 'c'], label: 'Go to Messages', category: 'Navigation' },
  { keys: ['g', 'r'], label: 'Go to Resources', category: 'Navigation' },
  { keys: ['g', 'h'], label: 'Go to Shelters', category: 'Navigation' },
  { keys: ['g', 'p'], label: 'Go to Reports', category: 'Navigation' },
  { keys: ['g', 'a'], label: 'Go to Audit Log', category: 'Navigation' },
  { keys: ['g', 'z'], label: 'Go to Resilience', category: 'Navigation' },
  { keys: ['g', 't'], label: 'Go to Settings', category: 'Navigation' },
  { keys: ['?'], label: 'Show this help dialog', category: 'Navigation' },
]

/**
 * Keyboard shortcuts help dialog — opens when the user presses `?`.
 * Spec §15: "Support keyboard navigation and visible focus states."
 */
export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if the user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const categories = Array.from(new Set(SHORTCUTS.map((s) => s.category)))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-muted-foreground" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            The dashboard is fully keyboard-accessible (spec §15). Press the keys below to navigate
            without a mouse.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {categories.map((cat) => (
            <div key={cat}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {cat}
              </div>
              <ul className="space-y-1">
                {SHORTCUTS.filter((s) => s.category === cat).map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-foreground/90">{s.label}</span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      {s.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-start gap-2 rounded-md border border-info/30 bg-info/5 p-2.5 text-xs text-muted-foreground">
          <Volume2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
          <span>
            Sound alerts are enabled for critical incidents by default. Configure them in
            <strong> Settings → Notifications</strong>.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
