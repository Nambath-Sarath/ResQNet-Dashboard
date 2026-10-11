'use client'

import { Sidebar } from './sidebar'
import { MobileNav } from './mobile-nav'
import { TopBar } from './topbar'
import { ConnectionBanner } from './connection-banner'
import { Footer } from './footer'
import { useRealtime } from '@/lib/use-realtime'
import { useNetworkMonitor } from '@/lib/use-network-monitor'
import { RealtimeEventFeedButton } from './realtime-feed'
import { OfflineBanner } from './offline-banner'
import { CommandPalette } from './command-palette'
import { KeyboardShortcutsHelp } from './keyboard-shortcuts-help'
import { unlockAudio } from '@/lib/sound'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

export function DashboardShell({ children }: { children: ReactNode }) {
  // Activate the socket.io connection while the dashboard is mounted.
  const { status, recentEvents, operatorsOnline } = useRealtime()
  // Activate the network monitor + offline write-queue replay engine.
  useNetworkMonitor()

  // Expose realtime status globally for the topbar/footer to read without prop drilling
  useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as unknown as { __resqnetRT?: unknown }).__resqnetRT = {
        status,
        recentEvents,
        operatorsOnline,
      }
      window.dispatchEvent(new CustomEvent('resqnet:rt', { detail: { status, recentEvents, operatorsOnline } }))
    }
  }, [status, recentEvents, operatorsOnline])

  // Unlock Web Audio on first user interaction (browser autoplay policy)
  useEffect(() => {
    const unlock = () => {
      unlockAudio()
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('click', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <MobileNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <OfflineBanner />
          <ConnectionBanner />
          <TopBar />
          <RealtimeEventFeedButton />
          <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
        </div>
      </div>
      <Footer />
      <CommandPalette />
      <KeyboardShortcutsHelp />
    </div>
  )
}
