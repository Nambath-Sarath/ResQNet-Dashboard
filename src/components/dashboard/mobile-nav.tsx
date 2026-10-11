'use client'

import { useAppStore, type DashboardView } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
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
  ShieldAlert,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import { useOverview } from '@/lib/hooks'

const NAV_SECTIONS: { title: string; items: { view: DashboardView; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    title: 'Operations',
    items: [
      { view: { name: 'overview' }, label: 'Overview', icon: LayoutDashboard },
      { view: { name: 'map' }, label: 'Situation Map', icon: Map },
      { view: { name: 'incidents' }, label: 'Incidents', icon: Siren },
      { view: { name: 'survivors' }, label: 'Survivors', icon: Users },
    ],
  },
  {
    title: 'Network',
    items: [
      { view: { name: 'nodes' }, label: 'Nodes', icon: Radio },
      { view: { name: 'modules' }, label: 'Modules', icon: Cpu },
      { view: { name: 'messages' }, label: 'Messages', icon: MessageSquare },
    ],
  },
  {
    title: 'Resources',
    items: [
      { view: { name: 'resources' }, label: 'Resources', icon: Package },
      { view: { name: 'shelters' }, label: 'Shelters', icon: Home },
    ],
  },
  {
    title: 'Administration',
    items: [
      { view: { name: 'reports' }, label: 'Reports', icon: FileBarChart },
      { view: { name: 'audit' }, label: 'Audit Log', icon: ShieldAlert },
      { view: { name: 'settings' }, label: 'Settings', icon: Settings },
    ],
  },
]

export function MobileNav() {
  const open = useAppStore((s) => s.mobileNavOpen)
  const setOpen = useAppStore((s) => s.setMobileNavOpen)
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const { data: overview } = useOverview()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-[260px] bg-sidebar p-0 text-sidebar-foreground">
        <SheetHeader className="h-14 flex-row items-center gap-2.5 border-b border-sidebar-border px-4 space-y-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <SheetTitle className="text-sm font-semibold">ResQNet</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-3.5rem)]">
          <nav className="px-2 py-3">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title} className="mb-4">
                <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                  {section.title}
                </div>
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const active =
                      view.name === item.view.name ||
                      (item.view.name === 'incidents' && view.name === 'incident') ||
                      (item.view.name === 'nodes' && view.name === 'node')
                    const Icon = item.icon
                    return (
                      <li key={item.label}>
                        <button
                          onClick={() => setView(item.view)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                            active
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                              : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60',
                          )}
                        >
                          <Icon className="h-4.5 w-4.5" />
                          <span>{item.label}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
          {overview && (
            <div className="mx-2.5 mb-3 rounded-md bg-sidebar-accent/50 p-2.5 text-xs">
              Gateway: {overview.network.online}/{overview.network.total_nodes} nodes online
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
