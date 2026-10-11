'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SessionUser } from '@/lib/types'

export type DashboardView =
  | { name: 'overview' }
  | { name: 'map' }
  | { name: 'incidents' }
  | { name: 'incident'; incidentId: string }
  | { name: 'survivors' }
  | { name: 'nodes' }
  | { name: 'node'; nodeId: string }
  | { name: 'modules' }
  | { name: 'messages' }
  | { name: 'resources' }
  | { name: 'shelters' }
  | { name: 'reports' }
  | { name: 'audit' }
  | { name: 'settings' }
  | { name: 'resilience' }

type ConnectionState = 'connected' | 'reconnecting' | 'offline'

type AppState = {
  // auth
  user: SessionUser | null
  setUser: (u: SessionUser | null) => void
  // navigation (client-side; spec says only / is exposed by the host)
  view: DashboardView
  setView: (v: DashboardView) => void
  // sidebar collapse (desktop)
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  // mobile sidebar
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  // connection
  connection: ConnectionState
  setConnection: (c: ConnectionState) => void
  lastSyncAt: string | null
  setLastSyncAt: (t: string | null) => void
  // theme
  theme: 'light' | 'dark' | 'system'
  setTheme: (t: 'light' | 'dark' | 'system') => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (u) => set({ user: u }),
      view: { name: 'overview' },
      setView: (v) => {
        set({ view: v, mobileNavOpen: false })
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0 })
        }
      },
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      mobileNavOpen: false,
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      connection: 'connected',
      setConnection: (c) => set({ connection: c }),
      lastSyncAt: null,
      setLastSyncAt: (t) => set({ lastSyncAt: t }),
      theme: 'system',
      setTheme: (t) => set({ theme: t }),
    }),
    {
      name: 'resqnet-app',
      partialize: (s) => ({ theme: s.theme, sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
)
