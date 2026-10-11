'use client'

import { Sidebar } from './sidebar'
import { MobileNav } from './mobile-nav'
import { TopBar } from './topbar'
import { ConnectionBanner } from './connection-banner'
import { Footer } from './footer'
import type { ReactNode } from 'react'

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <MobileNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <ConnectionBanner />
          <TopBar />
          <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
        </div>
      </div>
      <Footer />
    </div>
  )
}
