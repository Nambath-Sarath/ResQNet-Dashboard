'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiRequestError } from '@/lib/api-client'
import { useAppStore } from '@/lib/store'
import type {
  AuthMeResponse,
  LoginResponse,
  OverviewResponse,
  NodeSummary,
  NodeDetail,
  IncidentListItem,
  IncidentDetail,
} from '@/lib/types'

// --- Auth --------------------------------------------------------------------

export function useAuth() {
  return useQuery<AuthMeResponse>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<AuthMeResponse>('/api/v1/auth/me'),
    refetchInterval: 60_000,
    retry: false,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  const setUser = useAppStore((s) => s.setUser)
  return useMutation<
    LoginResponse,
    ApiRequestError,
    { username: string; password: string }
  >({
    mutationFn: (vars) =>
      api.post<LoginResponse>('/api/v1/auth/login', vars),
    onSuccess: (data) => {
      setUser(data.user)
      qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  const setUser = useAppStore((s) => s.setUser)
  const setView = useAppStore((s) => s.setView)
  return useMutation<void, ApiRequestError, void>({
    mutationFn: () => api.delete('/api/v1/auth/logout').then(() => undefined),
    onSettled: () => {
      setUser(null)
      setView({ name: 'overview' })
      qc.setQueryData(['auth', 'me'], { authenticated: false })
      qc.clear()
    },
  })
}

// --- Overview ----------------------------------------------------------------

export function useOverview() {
  const setLastSyncAt = useAppStore((s) => s.setLastSyncAt)
  const setConnection = useAppStore((s) => s.setConnection)
  return useQuery<OverviewResponse>({
    queryKey: ['overview'],
    queryFn: async () => {
      try {
        const r = await api.get<OverviewResponse>('/api/v1/overview')
        setLastSyncAt(new Date().toISOString())
        setConnection('connected')
        return r
      } catch (e) {
        if (e instanceof ApiRequestError && e.status >= 500) {
          setConnection('offline')
        }
        throw e
      }
    },
    refetchInterval: 30_000,
  })
}

// --- Nodes -------------------------------------------------------------------

export function useNodes(filters?: { status?: string; lifecycle?: string; q?: string }) {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.lifecycle) params.set('lifecycle', filters.lifecycle)
  if (filters?.q) params.set('q', filters.q)
  const qs = params.toString()
  return useQuery<{ nodes: NodeSummary[]; total: number }>({
    queryKey: ['nodes', filters],
    queryFn: () => api.get<{ nodes: NodeSummary[]; total: number }>(`/api/v1/nodes${qs ? `?${qs}` : ''}`),
    refetchInterval: 30_000,
  })
}

export function useNodeDetail(nodeId: string | null) {
  return useQuery<NodeDetail>({
    queryKey: ['node', nodeId],
    queryFn: () => {
      if (!nodeId) throw new Error('no nodeId')
      return api.get<NodeDetail>(`/api/v1/nodes/${nodeId}`)
    },
    enabled: !!nodeId,
    refetchInterval: 30_000,
  })
}

// --- Incidents ---------------------------------------------------------------

export function useIncidents(filters?: {
  status?: string
  priority?: string
  category?: string
  q?: string
}) {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.priority) params.set('priority', filters.priority)
  if (filters?.category) params.set('category', filters.category)
  if (filters?.q) params.set('q', filters.q)
  const qs = params.toString()
  return useQuery<{ incidents: IncidentListItem[]; total: number }>({
    queryKey: ['incidents', filters],
    queryFn: () =>
      api.get<{ incidents: IncidentListItem[]; total: number }>(
        `/api/v1/incidents${qs ? `?${qs}` : ''}`,
      ),
    refetchInterval: 20_000,
  })
}

export function useIncidentDetail(id: string | null) {
  return useQuery<IncidentDetail>({
    queryKey: ['incident', id],
    queryFn: () => {
      if (!id) throw new Error('no id')
      return api.get<IncidentDetail>(`/api/v1/incidents/${id}`)
    },
    enabled: !!id,
    refetchInterval: 15_000,
  })
}

export function useAcknowledgeIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (incidentId: string) =>
      api.patch(`/api/v1/incidents/${incidentId}`, { status: 'ACKNOWLEDGED' }),
    onSuccess: (_data, incidentId) => {
      qc.invalidateQueries({ queryKey: ['incident', incidentId] })
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useAssignIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ incidentId, assignedToId }: { incidentId: string; assignedToId: string }) =>
      api.patch(`/api/v1/incidents/${incidentId}`, { assigned_to_id: assignedToId }),
    onSuccess: (_d, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident', incidentId] })
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useAdvanceIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ incidentId, status, note }: { incidentId: string; status: string; note?: string }) =>
      api.patch(`/api/v1/incidents/${incidentId}`, { status, note }),
    onSuccess: (_d, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident', incidentId] })
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useAddNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ incidentId, body }: { incidentId: string; body: string }) =>
      api.post(`/api/v1/incidents/${incidentId}/notes`, { body }),
    onSuccess: (_d, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident', incidentId] })
    },
  })
}

export function useCreateIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      category: string
      description: string
      priority?: string
      people_affected?: number
      source_type?: string
      location?: { latitude: number; longitude: number; source?: string; accuracy_m?: number }
    }) => api.post<{ incident_id: string }>('/api/v1/incidents', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

// --- Node deployment + capabilities -----------------------------------------

export function useLockDeployment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      nodeId,
      latitude,
      longitude,
      accuracy_m,
      confirm,
    }: {
      nodeId: string
      latitude: number
      longitude: number
      accuracy_m?: number
      confirm?: boolean
    }) =>
      api.post(`/api/v1/nodes/${nodeId}/deployment`, {
        latitude,
        longitude,
        accuracy_m,
        confirm,
      }),
    onSuccess: (_d, { nodeId }) => {
      qc.invalidateQueries({ queryKey: ['node', nodeId] })
      qc.invalidateQueries({ queryKey: ['nodes'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

/**
 * Simulate a node heartbeat from the dashboard (operator-initiated test).
 * In production the node firmware posts directly; this is for QA/demo.
 */
export function useSimulateHeartbeat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      nodeId,
      nodeSecret,
      payload,
    }: {
      nodeId: string
      nodeSecret: string
      payload: {
        battery?: number
        link_quality?: number
        connected_clients?: number
        uptime_seconds?: number
        rssi?: number
        location?: { latitude: number; longitude: number; accuracy_m?: number; source?: string }
      }
    }) =>
      fetch(`/api/v1/nodes/${nodeId}/heartbeats`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-node-secret': nodeSecret,
        },
        body: JSON.stringify({
          ...payload,
          node_reported_at: new Date().toISOString(),
        }),
      }).then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new ApiRequestError(body?.error?.message ?? 'heartbeat failed', body?.error?.code ?? 'UNKNOWN', r.status)
        return body
      }),
    onSuccess: (_d, { nodeId }) => {
      qc.invalidateQueries({ queryKey: ['node', nodeId] })
      qc.invalidateQueries({ queryKey: ['nodes'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

/**
 * Submit a capability report on behalf of a node (operator-initiated test).
 */
export function useSubmitCapabilities() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      nodeId,
      nodeSecret,
      descriptor,
    }: {
      nodeId: string
      nodeSecret: string
      descriptor: {
        protocol_version?: string
        firmware_version?: string
        hardware_revision?: string
        modules: Array<{
          module_id: string
          type: string
          status: string
          capabilities: string[]
          firmware_version?: string
        }>
      }
    }) =>
      fetch(`/api/v1/nodes/${nodeId}/capabilities`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-node-secret': nodeSecret,
        },
        body: JSON.stringify(descriptor),
      }).then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new ApiRequestError(body?.error?.message ?? 'capability submit failed', body?.error?.code ?? 'UNKNOWN', r.status)
        return body
      }),
    onSuccess: (_d, { nodeId }) => {
      qc.invalidateQueries({ queryKey: ['node', nodeId] })
      qc.invalidateQueries({ queryKey: ['nodes'] })
    },
  })
}

/**
 * Fetch a node's auth_secret (admin only) — used to power the simulator panels.
 */
export function useNodeSecret(nodeId: string | null) {
  return useQuery<{ auth_secret: string }>({
    queryKey: ['node-secret', nodeId],
    queryFn: async () => {
      if (!nodeId) throw new Error('no nodeId')
      const r = await fetch(`/api/v1/nodes/${nodeId}/secret`)
      if (!r.ok) throw new ApiRequestError('Cannot fetch node secret', 'FORBIDDEN', r.status)
      return r.json()
    },
    enabled: !!nodeId,
  })
}

// --- Survivors ---------------------------------------------------------------

export function useSurvivors(filters?: { status?: string; q?: string }) {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.q) params.set('q', filters.q)
  const qs = params.toString()
  return useQuery<{ survivors: Array<{ id: string; temporary_ref: string; display_name: string | null; contact: string | null; first_seen_at: string; last_seen_at: string; status: string; location_lat: number | null; location_lon: number | null; location_source: string | null; notes: string | null }>; total: number; can_see_contact: boolean }>({
    queryKey: ['survivors', filters],
    queryFn: () => api.get(`/api/v1/survivors${qs ? `?${qs}` : ''}`),
    refetchInterval: 30_000,
  })
}

// --- Messages ----------------------------------------------------------------

export function useMessages(filters?: { status?: string; destination?: string; q?: string }) {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.destination) params.set('destination', filters.destination)
  if (filters?.q) params.set('q', filters.q)
  const qs = params.toString()
  return useQuery<{ messages: Array<{ id: string; source: string; destination: string; message_type: string; body: string; status: string; created_at: string; accepted_at: string | null; forwarded_at: string | null; acknowledged_at: string | null; expires_at: string | null; failure_reason: string | null; attempts: Array<{ id: string; attempted_at: string; outcome: string; error_code: string | null }> }>; total: number }>({
    queryKey: ['messages', filters],
    queryFn: () => api.get(`/api/v1/messages${qs ? `?${qs}` : ''}`),
    refetchInterval: 20_000,
  })
}

export function useCreateMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { destination: string; body: string; message_type?: string; ttl_seconds?: number }) =>
      api.post<{ message_id: string }>('/api/v1/messages', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] })
    },
  })
}

// --- Resources ---------------------------------------------------------------

export function useResources(filters?: { type?: string }) {
  const params = new URLSearchParams()
  if (filters?.type) params.set('type', filters.type)
  const qs = params.toString()
  return useQuery<{ resources: Array<{ id: string; resource_type: string; unit: string; quantity: number; reserved_quantity: number; available_quantity: number; low_stock: boolean; location_label: string | null; location_lat: number | null; location_lon: number | null; updated_at: string; updated_by_id: string | null }>; total: number; low_stock_count: number }>({
    queryKey: ['resources', filters],
    queryFn: () => api.get(`/api/v1/resources${qs ? `?${qs}` : ''}`),
    refetchInterval: 30_000,
  })
}

export function useUpdateResource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { resource_type: string; unit: string; quantity: number; location_label?: string; location_lat?: number; location_lon?: number }) =>
      api.post<{ resource: { id: string } }>('/api/v1/resources', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] })
    },
  })
}

export function useResourceRequests() {
  return useQuery({
    queryKey: ['resource-requests'],
    queryFn: () => api.get<{ requests: Array<{ id: string; resource_type: string; unit: string; quantity: number; status: string; requested_by: string | null; notes: string | null; created_at: string; fulfilled_at: string | null; resource: { id: string; resource_type: string; unit: string; quantity: number } | null }>; total: number }>('/api/v1/resources/requests'),
    refetchInterval: 30_000,
  })
}

export function useCreateResourceRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { resource_type: string; unit: string; quantity: number; notes?: string }) =>
      api.post<{ request: { id: string } }>('/api/v1/resources/requests', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resource-requests'] })
    },
  })
}

// --- Shelters ----------------------------------------------------------------

export function useShelters() {
  return useQuery<{ shelters: Array<{ id: string; name: string; latitude: number; longitude: number; capacity: number; occupancy_estimate: number; occupancy_pct: number; is_full: boolean; nearly_full: boolean; status: string; updated_at: string; updated_by: string | null }>; total: number; total_capacity: number; total_occupancy: number }>({
    queryKey: ['shelters'],
    queryFn: () => api.get('/api/v1/shelters'),
    refetchInterval: 30_000,
  })
}

export function useUpdateShelter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; latitude: number; longitude: number; capacity: number; occupancy_estimate?: number; status?: string }) =>
      api.post<{ shelter: { id: string } }>('/api/v1/shelters', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shelters'] })
    },
  })
}

// --- Reports -----------------------------------------------------------------

export function useIncidentReport(since?: string) {
  const params = new URLSearchParams()
  if (since) params.set('since', since)
  params.set('format', 'json')
  const qs = params.toString()
  return useQuery<{ summary: { total: number; by_category: Record<string, number>; by_status: Record<string, number>; by_priority: Record<string, number>; avg_ack_seconds: number | null; avg_assign_seconds: number | null; avg_resolve_seconds: number | null; max_resolve_seconds: number | null; min_resolve_seconds: number | null; since: string; generated_at: string }; incidents: Array<{ id: string; created_at: string; category: string; priority: string; status: string; people_affected: number | null; acknowledged_at: string | null; assigned_at: string | null; resolved_at: string | null; assignee: string | null; source_node: string | null; description: string; ack_seconds: number | null; resolve_seconds: number | null }> }>({
    queryKey: ['report-incidents', since],
    queryFn: () => api.get(`/api/v1/reports/incidents?${qs}`),
    refetchInterval: 60_000,
  })
}

/** Trigger a CSV download in the browser. */
export function downloadIncidentCsv(since?: string) {
  const params = new URLSearchParams()
  if (since) params.set('since', since)
  params.set('format', 'csv')
  const qs = params.toString()
  // Use a direct navigation to trigger the download with cookies
  window.open(`/api/v1/reports/incidents?${qs}`, '_blank')
}

// --- Audit log ---------------------------------------------------------------

export function useAuditLogs(filters?: { action?: string; entity_type?: string; actor_id?: string; since?: string }) {
  const params = new URLSearchParams()
  if (filters?.action) params.set('action', filters.action)
  if (filters?.entity_type) params.set('entity_type', filters.entity_type)
  if (filters?.actor_id) params.set('actor_id', filters.actor_id)
  if (filters?.since) params.set('since', filters.since)
  const qs = params.toString()
  return useQuery<{ logs: Array<{ id: string; actor_type: string; actor_id: string | null; action: string; entity_type: string | null; entity_id: string | null; timestamp: string; metadata: string | null }>; total: number; viewer: { id: string; role: string } }>({
    queryKey: ['audit-logs', filters],
    queryFn: () => api.get(`/api/v1/audit-logs?${qs}`),
    refetchInterval: 30_000,
  })
}

// --- Operators (settings) ----------------------------------------------------

export function useOperators() {
  return useQuery<{ operators: Array<{ id: string; username: string; display_name: string; role: string; active: boolean; created_at: string; updated_at: string; active_sessions: number }> }>({
    queryKey: ['operators'],
    queryFn: () => api.get('/api/v1/operators'),
    refetchInterval: 60_000,
  })
}

export function useCreateOperator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { username: string; display_name: string; password: string; role: string }) =>
      api.post<{ id: string }>('/api/v1/operators', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operators'] })
    },
  })
}

// --- Settings thresholds -----------------------------------------------------

export function useThresholds() {
  return useQuery<{ thresholds: Record<string, number>; build_version: string }>({
    queryKey: ['thresholds'],
    queryFn: () => api.get('/api/v1/settings/thresholds'),
    refetchInterval: 300_000,
  })
}

// --- Map data ----------------------------------------------------------------

export function useMapData(layers?: string) {
  const params = new URLSearchParams()
  if (layers) params.set('layers', layers)
  const qs = params.toString()
  return useQuery<{
    nodes?: Array<{ id: string; display_name: string; lifecycle_state: string; deployment_lat: number | null; deployment_lon: number | null; deployment_accuracy_m: number | null; live_lat: number | null; live_lon: number | null; live_accuracy_m: number | null; live_captured_at: string | null; online: boolean; battery: number | null; health_state: string; runtime_state: string }>
    incidents?: Array<{ id: string; category: string; priority: string; status: string; description: string; people_affected: number | null; created_at: string; location_lat: number; location_lon: number; location_accuracy_m: number | null; location_source: string | null; location_captured_at: string | null }>
    survivors?: Array<{ id: string; temporary_ref: string; status: string; location_lat: number; location_lon: number; location_source: string | null; last_seen_at: string }>
    shelters?: Array<{ id: string; name: string; latitude: number; longitude: number; capacity: number; occupancy_estimate: number; status: string }>
    generated_at: string
    freshness: { last_updated_at: string; stale: boolean }
  }>({
    queryKey: ['map', layers],
    queryFn: () => api.get(`/api/v1/map${qs ? `?${qs}` : ''}`),
    refetchInterval: 20_000,
  })
}

// --- Stage 4: Resilience / system ------------------------------------------

export function useNodeQueue(nodeId: string | null) {
  return useQuery<{
    node_id: string
    queue_size: number
    queue_limit: number
    overflow_policy: string
    queued: Array<{ id: string; source: string; destination: string; body: string; status: string; created_at: string; expires_at: string | null }>
    expired_count: number
    expired: Array<{ id: string; source: string; destination: string; body: string; status: string; created_at: string }>
    note: string
  }>({
    queryKey: ['node-queue', nodeId],
    queryFn: () => {
      if (!nodeId) throw new Error('no nodeId')
      return api.get(`/api/v1/nodes/${nodeId}/queue`)
    },
    enabled: !!nodeId,
    refetchInterval: 15_000,
  })
}

export function useReplayNodeQueue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ nodeId, mode }: { nodeId: string; mode: 'replay' | 'expire' }) =>
      api.post<{ forwarded?: number; duplicates?: number; expired?: number; note?: string }>(`/api/v1/nodes/${nodeId}/queue`, { mode }),
    onSuccess: (_d, { nodeId }) => {
      qc.invalidateQueries({ queryKey: ['node-queue', nodeId] })
      qc.invalidateQueries({ queryKey: ['messages'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useBackups() {
  return useQuery<{
    backups: Array<{ id: string; name: string; size: number; created_at: string }>
    total: number
    last_backup_at: string | null
    backup_dir: string
    note: string
  }>({
    queryKey: ['backups'],
    queryFn: () => api.get('/api/v1/system/backup'),
    refetchInterval: 60_000,
  })
}

export function useCreateBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ backup_id: string; name: string; size_bytes: number }>('/api/v1/system/backup'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useTestRestore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (backupId: string) =>
      api.post<{ verified: boolean; size_bytes: number; readable: boolean }>(`/api/v1/system/backup?test=true&id=${backupId}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] })
    },
  })
}

export function useDeleteBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (backupId: string) => api.delete(`/api/v1/system/backup?id=${backupId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] })
    },
  })
}

export function useClockDrift() {
  return useQuery<{
    gateway_time: string
    gateway_clock_source: string
    nodes: Array<{ node_id: string; display_name: string; has_heartbeat: boolean; node_reported_at?: string; received_at?: string; drift_ms: number | null; drift_label: string; uncertainty: 'ok' | 'warning' | 'critical' | 'unknown' }>
    summary: { total: number; synchronized: number; uncertain: number }
    note: string
  }>({
    queryKey: ['clock-drift'],
    queryFn: () => api.get('/api/v1/system/clock'),
    refetchInterval: 30_000,
  })
}

export function useFieldTestChecklist() {
  return useQuery<{
    items: Array<{ id: string; section: string; text: string; severity: string; status: 'pass' | 'fail' | 'skip' | 'pending'; note: string; recorded_at: string | null }>
    summary: { total: number; passed: number; failed: number; skipped: number; pending: number }
    generated_at: string
    spec_ref: string
    note: string
  }>({
    queryKey: ['field-test'],
    queryFn: () => api.get('/api/v1/system/field-test'),
    refetchInterval: 60_000,
  })
}

export function useRecordFieldTest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ checklistId, status, note }: { checklistId: string; status: 'pass' | 'fail' | 'skip' | 'pending'; note?: string }) =>
      api.patch(`/api/v1/system/field-test/${checklistId}`, { status, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-test'] })
    },
  })
}

// --- Global search + trends -------------------------------------------------

export type SearchResult = {
  type: 'incident' | 'node' | 'survivor' | 'shelter' | 'message'
  id: string
  title: string
  subtitle: string
  badge: string
  meta: string
  created_at?: string
  view: { name: 'incident'; incidentId: string } | { name: 'node'; nodeId: string } | { name: 'survivors' } | { name: 'shelters' } | { name: 'messages' }
}

export function useGlobalSearch(q: string, enabled: boolean) {
  return useQuery<{ results: SearchResult[]; total: number; q: string; counts: Record<string, number> }>({
    queryKey: ['search', q],
    queryFn: () => api.get(`/api/v1/search?q=${encodeURIComponent(q)}`),
    enabled: enabled && q.length >= 2,
    staleTime: 10_000,
  })
}

export function useTrends(hours = 24) {
  return useQuery<{
    window_hours: number
    since: string
    generated_at: string
    incidents: Array<{ hour: string; count: number; critical: number; resolved: number }>
    heartbeats: Array<{ hour: string; heartbeats: number }>
    summary: { total_incidents: number; total_critical: number; peak_per_hour: number; avg_per_hour: number }
  }>({
    queryKey: ['trends', hours],
    queryFn: () => api.get(`/api/v1/reports/trends?hours=${hours}`),
    refetchInterval: 60_000,
  })
}
