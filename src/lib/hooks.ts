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
