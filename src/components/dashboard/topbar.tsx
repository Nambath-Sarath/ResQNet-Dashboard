'use client'

import { useAppStore } from '@/lib/store'
import { useOverview, useLogout } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Menu,
  Sun,
  Moon,
  Monitor,
  LogOut,
  ChevronRight,
  Radio,
  Server,
  Clock,
  Search,
  Volume2,
  VolumeX,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from 'next-themes'
import { StatusBadge } from '@/components/shared/status-badge'
import { FreshnessLabel } from '@/components/shared/freshness-label'
import { ResilienceStatusPill } from '@/components/dashboard/resilience-status'
import { useNotifPrefs } from '@/lib/notif-prefs'
import { toast } from 'sonner'
import { formatDateTime, titleCase } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const VIEW_TITLES: Record<string, string> = {
  overview: 'Overview',
  map: 'Situation Map',
  incidents: 'Incidents',
  incident: 'Incident Detail',
  survivors: 'Survivor Registry',
  nodes: 'Node Management',
  node: 'Node Detail',
  modules: 'Module Management',
  messages: 'Messages',
  resources: 'Resources',
  shelters: 'Shelters',
  reports: 'Reports',
  audit: 'Audit Log',
  settings: 'Settings',
}

export function TopBar() {
  const view = useAppStore((s) => s.view)
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen)
  const user = useAppStore((s) => s.user)
  const { data: overview, isFetching, refetch } = useOverview()
  const logout = useLogout()
  const { theme, setTheme } = useTheme()

  const title = VIEW_TITLES[view.name] ?? 'Dashboard'
  const subtitle =
    view.name === 'incident' ? view.incidentId : view.name === 'node' ? view.nodeId : undefined

  const initials = user?.display_name
    ?.split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {/* Mobile menu */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Breadcrumb */}
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
        )}
        {subtitle && (
          <span className="truncate font-mono text-sm text-muted-foreground">{subtitle}</span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {/* Gateway status pills (desktop) */}
        {overview && (
          <div className="hidden items-center gap-1.5 lg:flex">
            <StatusBadge
              tone={overview.gateway_health.api_status === 'ok' ? 'success' : 'danger'}
              icon={<Server className="h-3 w-3" />}
              label="API"
              size="sm"
              pulse={overview.gateway_health.api_status === 'ok'}
            />
            <StatusBadge
              tone={
                overview.gateway_health.database_status === 'connected' ? 'success' : 'danger'
              }
              icon={<Radio className="h-3 w-3" />}
              label="DB"
              size="sm"
            />
            <span className="hidden items-center gap-1 text-xs text-muted-foreground xl:flex">
              <Clock className="h-3 w-3" />
              <FreshnessLabel
                timestamp={overview.freshness.last_updated_at}
                label="Synced"
                className="text-muted-foreground"
              />
            </span>
          </div>
        )}

        {/* Resilience status (network + write-queue) */}
        <ResilienceStatusPill />

        {/* Command palette trigger (Cmd+K) */}
        <button
          onClick={() => {
            // Dispatch a synthetic Cmd+K to open the palette
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: navigator.platform.includes('Mac') }))
          }}
          className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
          title="Open command palette (Cmd+K)"
        >
          <Search className="h-3 w-3" />
          <span>Search…</span>
          <kbd className="rounded border border-border bg-muted px-1 py-0 font-mono text-[9px]">⌘K</kbd>
        </button>

        {/* Refresh */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          title="Refresh"
          className={cn(isFetching && 'animate-spin')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </Button>

        {/* Sound mute toggle */}
        <SoundToggleButton />

        {/* Theme */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme('light')}>
              <Sun className="mr-2 h-4 w-4" /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              <Moon className="mr-2 h-4 w-4" /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>
              <Monitor className="mr-2 h-4 w-4" /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2 transition-colors hover:bg-accent">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {initials ?? '?'}
                </AvatarFallback>
              </Avatar>
              <div className="hidden flex-col items-start leading-tight sm:flex">
                <span className="text-xs font-medium">{user?.display_name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {titleCase(user?.role)}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{user?.display_name}</span>
              <span className="text-xs font-normal text-muted-foreground">@{user?.username}</span>
              <span className="mt-1 inline-flex w-fit">
                <StatusBadge
                  tone="info"
                  label={titleCase(user?.role)}
                  size="sm"
                />
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Session expires at {overview ? formatDateTime(new Date(Date.now() + 12 * 3600_000)) : '—'}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logout.mutate()}
              className="text-danger focus:text-danger"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

/**
 * Quick mute/unmute toggle for sound alerts — shown in the topbar.
 */
function SoundToggleButton() {
  const soundEnabled = useNotifPrefs((s) => s.soundEnabled)
  const setSoundEnabled = useNotifPrefs((s) => s.setSoundEnabled)
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        const next = !soundEnabled
        setSoundEnabled(next)
        toast.success(next ? 'Sound alerts enabled.' : 'Sound alerts muted.')
      }}
      title={soundEnabled ? 'Mute sound alerts' : 'Enable sound alerts'}
    >
      {soundEnabled ? (
        <Volume2 className="h-4 w-4" />
      ) : (
        <VolumeX className="h-4 w-4 text-muted-foreground" />
      )}
    </Button>
  )
}
