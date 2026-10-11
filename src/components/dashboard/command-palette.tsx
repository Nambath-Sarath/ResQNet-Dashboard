'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useGlobalSearch, type SearchResult } from '@/lib/hooks'
import { useAppStore, type DashboardView } from '@/lib/store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Siren, Radio, Users, Home, MessageSquare, ArrowRight, Search, CornerDownLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo, titleCase, PRIORITY_LABELS } from '@/lib/format'

const QUICK_NAV: { label: string; hint: string; view: DashboardView; icon: typeof Siren }[] = [
  { label: 'Overview', hint: 'Dashboard home', view: { name: 'overview' }, icon: Radio },
  { label: 'Situation Map', hint: 'Geographic view', view: { name: 'map' }, icon: Radio },
  { label: 'Incidents', hint: 'SOS queue', view: { name: 'incidents' }, icon: Siren },
  { label: 'Survivors', hint: 'Registry', view: { name: 'survivors' }, icon: Users },
  { label: 'Nodes', hint: 'Node inventory', view: { name: 'nodes' }, icon: Radio },
  { label: 'Messages', hint: 'Comms queue', view: { name: 'messages' }, icon: MessageSquare },
  { label: 'Resources', hint: 'Inventory', view: { name: 'resources' }, icon: Home },
  { label: 'Shelters', hint: 'Capacity', view: { name: 'shelters' }, icon: Home },
  { label: 'Reports', hint: 'Metrics + export', view: { name: 'reports' }, icon: Radio },
  { label: 'Audit Log', hint: 'Operator history', view: { name: 'audit' }, icon: Radio },
  { label: 'Resilience', hint: 'Offline + backup', view: { name: 'resilience' }, icon: Radio },
  { label: 'Settings', hint: 'Operators + thresholds', view: { name: 'settings' }, icon: Radio },
]

const TYPE_ICONS: Record<string, typeof Siren> = {
  incident: Siren,
  node: Radio,
  survivor: Users,
  shelter: Home,
  message: MessageSquare,
}

const TYPE_TONES: Record<string, string> = {
  incident: 'text-danger bg-danger/10',
  node: 'text-success bg-success/10',
  survivor: 'text-info bg-info/10',
  shelter: 'text-success bg-success/10',
  message: 'text-muted-foreground bg-muted',
}

/**
 * Global command palette triggered by Cmd+K / Ctrl+K.
 * Provides quick navigation + global search across all entities.
 * Spec §15: "Support keyboard navigation and visible focus states."
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const setView = useAppStore((s) => s.setView)

  const isSearching = query.trim().length >= 2
  const { data: searchData } = useGlobalSearch(query.trim(), isSearching)

  // Keyboard shortcut to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => {
          if (!o) {
            setQuery('')
            setSelectedIndex(0)
          }
          return !o
        })
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
      // Quick nav shortcuts: g o (overview), g i (incidents), etc.
      if (!open && e.key === 'g') {
        // Set a flag for the next key
        const next = (e2: KeyboardEvent) => {
          const map: Record<string, DashboardView> = {
            o: { name: 'overview' },
            m: { name: 'map' },
            i: { name: 'incidents' },
            s: { name: 'survivors' },
            n: { name: 'nodes' },
            c: { name: 'messages' },
            r: { name: 'resources' },
            h: { name: 'shelters' },
            p: { name: 'reports' },
            a: { name: 'audit' },
            z: { name: 'resilience' },
            t: { name: 'settings' },
          }
          const v = map[e2.key]
          if (v) {
            e2.preventDefault()
            setView(v)
          }
          window.removeEventListener('keydown', next)
        }
        window.addEventListener('keydown', next, { once: true })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, setView])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  // Build the items list
  const searchResults: SearchResult[] = isSearching ? (searchData?.results ?? []) : []
  const navItems = isSearching ? [] : QUICK_NAV
  const allItems = [
    ...searchResults.map((r) => ({
      kind: 'search' as const,
      id: `search-${r.type}-${r.id}`,
      title: r.title,
      subtitle: r.subtitle,
      type: r.type,
      badge: r.badge,
      action: () => { setView(r.view as DashboardView); setOpen(false) },
    })),
    ...navItems.map((n) => ({
      kind: 'nav' as const,
      id: `nav-${n.label}`,
      title: n.label,
      subtitle: n.hint,
      type: 'nav',
      badge: '',
      icon: n.icon,
      action: () => { setView(n.view); setOpen(false) },
    })),
  ]

  // Reset selection when query changes — use a key derived from query instead of an effect.
  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      allItems[selectedIndex]?.action()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[15vh] max-w-2xl gap-0 p-0 translate-y-0 sm:translate-y-0" style={{ transform: 'none' }}>
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Search and quick navigation</DialogDescription>
        </DialogHeader>
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search incidents, nodes, survivors… or type a command"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto scrollbar-thin">
          {allItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {isSearching ? `No results for "${query}"` : 'Start typing to search…'}
            </div>
          ) : (
            <>
              {isSearching && searchResults.length > 0 && (
                <div className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Search results ({searchResults.length})
                </div>
              )}
              <ul className="p-1.5">
                {allItems.map((item, idx) => {
                  const Icon = 'icon' in item && item.icon ? item.icon : TYPE_ICONS[item.type] ?? Search
                  const tone = 'kind' in item && item.kind === 'search' ? TYPE_TONES[item.type] : 'text-muted-foreground bg-muted'
                  return (
                    <li key={item.id} data-index={idx}>
                      <button
                        onClick={item.action}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                          idx === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50',
                        )}
                      >
                        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', tone)}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{item.title}</span>
                            {item.badge && (
                              <span className="shrink-0 rounded bg-muted px-1 py-0 text-[9px] font-bold uppercase">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">{item.subtitle}</div>
                        </div>
                        {idx === selectedIndex && (
                          <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5">
              <kbd className="rounded border border-border bg-muted px-1 py-0 font-mono">↑↓</kbd>
              navigate
            </span>
            <span className="inline-flex items-center gap-0.5">
              <kbd className="rounded border border-border bg-muted px-1 py-0 font-mono">↵</kbd>
              select
            </span>
            <span className="inline-flex items-center gap-0.5">
              <kbd className="rounded border border-border bg-muted px-1 py-0 font-mono">esc</kbd>
              close
            </span>
          </div>
          <span className="hidden sm:inline">
            <kbd className="rounded border border-border bg-muted px-1 py-0 font-mono">g</kbd> + letter for quick nav
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
