'use client'

import { useAppStore, type DashboardView } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  LayoutDashboard,
  Map,
  Siren,
  Users,
  Radio,
  Cpu,
  MessageSquare,
  Package,
  Home,
  FileBarChart,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react'
import { useOverview } from '@/lib/hooks'
import { StatusBadge } from '@/components/shared/status-badge'

type NavItem = {
  view: DashboardView
  label: string
  icon: typeof LayoutDashboard
  match: (v: DashboardView) => boolean
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Operations',
    items: [
      { view: { name: 'overview' }, label: 'Overview', icon: LayoutDashboard, match: (v) => v.name === 'overview' },
      { view: { name: 'map' }, label: 'Situation Map', icon: Map, match: (v) => v.name === 'map' },
      { view: { name: 'incidents' }, label: 'Incidents', icon: Siren, match: (v) => v.name === 'incidents' || v.name === 'incident' },
      { view: { name: 'survivors' }, label: 'Survivors', icon: Users, match: (v) => v.name === 'survivors' },
    ],
  },
  {
    title: 'Network',
    items: [
      { view: { name: 'nodes' }, label: 'Nodes', icon: Radio, match: (v) => v.name === 'nodes' || v.name === 'node' },
      { view: { name: 'modules' }, label: 'Modules', icon: Cpu, match: (v) => v.name === 'modules' },
      { view: { name: 'messages' }, label: 'Messages', icon: MessageSquare, match: (v) => v.name === 'messages' },
    ],
  },
  {
    title: 'Resources',
    items: [
      { view: { name: 'resources' }, label: 'Resources', icon: Package, match: (v) => v.name === 'resources' },
      { view: { name: 'shelters' }, label: 'Shelters', icon: Home, match: (v) => v.name === 'shelters' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { view: { name: 'reports' }, label: 'Reports', icon: FileBarChart, match: (v) => v.name === 'reports' },
      { view: { name: 'audit' }, label: 'Audit Log', icon: ShieldAlert, match: (v) => v.name === 'audit' },
      { view: { name: 'resilience' }, label: 'Resilience', icon: ShieldCheck, match: (v) => v.name === 'resilience' },
      { view: { name: 'settings' }, label: 'Settings', icon: Settings, match: (v) => v.name === 'settings' },
    ],
  },
]

export function Sidebar() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggle = useAppStore((s) => s.toggleSidebar)
  const { data: overview } = useOverview()

  const criticalCount = overview?.incidents.critical ?? 0

  return (
    <aside
      className={cn(
        'relative hidden md:flex flex-col shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-[244px]',
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
          <ShieldCheck className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">ResQNet</span>
            <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
              Command Dashboard
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 scrollbar-thin">
        <nav className="px-2 py-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-4">
              {!collapsed && (
                <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                  {section.title}
                </div>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = item.match(view)
                  const Icon = item.icon
                  const showCriticalDot =
                    item.view.name === 'incidents' && criticalCount > 0
                  return (
                    <li key={item.label}>
                      <button
                        onClick={() => setView(item.view)}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                          collapsed && 'justify-center px-0',
                          active
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                        )}
                      >
                        <Icon className={cn('h-4.5 w-4.5 shrink-0', active && 'text-sidebar-primary')} />
                        {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                        {showCriticalDot && (
                          <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
                          </span>
                        )}
                        {showCriticalDot && collapsed && (
                          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-danger-foreground">
                            {criticalCount}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Footer status + collapse */}
      <div className="border-t border-sidebar-border p-2.5">
        {!collapsed && overview && (
          <div className="mb-2 rounded-md bg-sidebar-accent/50 p-2.5">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
              Gateway
            </div>
            <div className="flex items-center justify-between">
              <StatusBadge
                tone={overview.gateway_health.api_status === 'ok' ? 'success' : 'danger'}
                label={overview.gateway_health.api_status === 'ok' ? 'API OK' : 'API down'}
                size="sm"
                pulse
              />
              <span className="text-[10px] tabular-nums text-sidebar-foreground/60">
                {overview.network.online}/{overview.network.total_nodes} nodes
              </span>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className="w-full justify-center text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  )
}
