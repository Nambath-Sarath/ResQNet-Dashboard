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
import { LoadingState } from '@/components/shared/state-views'
import { useEffect } from 'react'

export default function Home() {
  const { data: auth, isLoading } = useAuth()
  const user = useAppStore((s) => s.user)
  const setUser = useAppStore((s) => s.setUser)
  const view = useAppStore((s) => s.view)

  // Keep store in sync with the server-side auth state.
  useEffect(() => {
    if (auth?.authenticated && auth.user) {
      setUser(auth.user)
    } else if (auth && !auth.authenticated) {
      setUser(null)
    }
  }, [auth, setUser])

  if (isLoading && !user) {
    return <LoadingState message="Connecting to gateway…" className="min-h-screen" />
  }

  const authenticated = auth?.authenticated || !!user

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
      {view.name === 'settings' && <SettingsPage />}
    </DashboardShell>
  )
}
