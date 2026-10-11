'use client'

import { useAuth } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { DashboardShell } from '@/components/dashboard/shell'
import { LoginPage } from '@/components/pages/login-page'
import { OverviewPage } from '@/components/pages/overview-page'
import { NodeListPage } from '@/components/pages/node-list-page'
import { NodeDetailPage } from '@/components/pages/node-detail-page'
import { IncidentQueuePage } from '@/components/pages/incident-queue-page'
import { IncidentDetailPage } from '@/components/pages/incident-detail-page'
import { SituationMapPage } from '@/components/pages/situation-map-page'
import { SurvivorRegistryPage } from '@/components/pages/survivor-registry-page'
import { MessagesPage } from '@/components/pages/messages-page'
import { ResourcesPage } from '@/components/pages/resources-page'
import { SheltersPage } from '@/components/pages/shelters-page'
import { ReportsPage } from '@/components/pages/reports-page'
import { AuditLogPage } from '@/components/pages/audit-log-page'
import { SettingsPage } from '@/components/pages/settings-page'
import { ResiliencePage } from '@/components/pages/resilience-page'
import { LoadingState } from '@/components/shared/state-views'
import { useEffect } from 'react'

export default function Home() {
  const { data: auth, isLoading } = useAuth()
  const user = useAppStore((s) => s.user)
  const setUser = useAppStore((s) => s.setUser)
  const view = useAppStore((s) => s.view)

  // Keep store in sync with the server-side auth state.
  // The server response is authoritative — if it says not authenticated,
  // clear the stale user from the store.
  useEffect(() => {
    if (auth?.authenticated && auth.user) {
      setUser(auth.user)
    } else if (auth && !auth.authenticated) {
      // Session is truly gone — clear the stale user so we show login
      setUser(null)
    }
  }, [auth, setUser])

  // Show loading state only on the very first load when we have no data yet
  if (isLoading && !auth && !user) {
    return <LoadingState message="Connecting to gateway…" className="min-h-screen" />
  }

  // Auth state priority:
  // 1. If the server explicitly says authenticated: true → show dashboard
  // 2. If the server explicitly says authenticated: false → show login (session expired)
  // 3. If auth is still loading/refetching → trust the store user (optimistic)
  //    This handles the brief gap during login when useAuth is refetching.
  let authenticated: boolean
  if (auth?.authenticated === true) {
    authenticated = true
  } else if (auth?.authenticated === false) {
    // Server confirmed not authenticated — but if we have a store user AND
    // auth is loading (refetching), give it a chance before kicking to login.
    authenticated = isLoading && !!user ? true : false
  } else {
    // auth is undefined (first load) — trust store user
    authenticated = !!user
  }

  if (!authenticated) {
    return <LoginPage />
  }

  return (
    <DashboardShell>
      {view.name === 'overview' && <OverviewPage />}
      {view.name === 'map' && <SituationMapPage />}
      {view.name === 'incidents' && <IncidentQueuePage />}
      {view.name === 'incident' && <IncidentDetailPage incidentId={view.incidentId} />}
      {view.name === 'survivors' && <SurvivorRegistryPage />}
      {view.name === 'nodes' && <NodeListPage />}
      {view.name === 'node' && <NodeDetailPage nodeId={view.nodeId} />}
      {view.name === 'modules' && <SituationMapPage />}
      {view.name === 'messages' && <MessagesPage />}
      {view.name === 'resources' && <ResourcesPage />}
      {view.name === 'shelters' && <SheltersPage />}
      {view.name === 'reports' && <ReportsPage />}
      {view.name === 'audit' && <AuditLogPage />}
      {view.name === 'resilience' && <ResiliencePage />}
      {view.name === 'settings' && <SettingsPage />}
    </DashboardShell>
  )
}
