'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Generic saved filter presets store.
 *
 * Operators often apply the same filters repeatedly. This store persists named
 * filter combinations to localStorage so they can be recalled with one click.
 * Supports multiple page types: incidents, nodes, messages, audit.
 */

export type IncidentFilter = {
  status?: string
  priority?: string
  category?: string
  q?: string
}

export type NodeFilter = {
  status?: string
  lifecycle?: string
  q?: string
}

export type MessageFilter = {
  status?: string
  destination?: string
  q?: string
}

export type AuditFilter = {
  action?: string
  entity_type?: string
  actor_id?: string
  q?: string
}

export type FilterType = 'incident' | 'node' | 'message' | 'audit'
export type AnyFilter = IncidentFilter | NodeFilter | MessageFilter | AuditFilter

export type FilterPreset = {
  id: string
  name: string
  description: string
  type: FilterType
  filters: AnyFilter
  created_at: string
  pinned?: boolean
}

type PresetState = {
  presets: FilterPreset[]
  addPreset: (type: FilterType, name: string, description: string, filters: AnyFilter) => string
  removePreset: (id: string) => void
  renamePreset: (id: string, name: string) => void
  togglePin: (id: string) => void
  hasPreset: (type: FilterType, name: string) => boolean
  getPresets: (type: FilterType) => FilterPreset[]
}

function genId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const DEFAULT_PRESETS: FilterPreset[] = [
  {
    id: 'default-incident-critical',
    name: 'Critical unacknowledged',
    description: 'CRITICAL priority, NEW status',
    type: 'incident',
    filters: { priority: 'CRITICAL', status: 'NEW' } as IncidentFilter,
    created_at: '2026-10-11T00:00:00.000Z',
    pinned: true,
  },
  {
    id: 'default-incident-open',
    name: 'All open',
    description: 'All non-resolved incidents',
    type: 'incident',
    filters: { status: 'all' } as IncidentFilter,
    created_at: '2026-10-11T00:00:00.000Z',
  },
  {
    id: 'default-incident-rescue',
    name: 'Rescue only',
    description: 'Rescue category, any status',
    type: 'incident',
    filters: { category: 'RESCUE' } as IncidentFilter,
    created_at: '2026-10-11T00:00:00.000Z',
  },
  {
    id: 'default-node-online',
    name: 'Online nodes',
    description: 'Only currently online nodes',
    type: 'node',
    filters: { status: 'online' } as NodeFilter,
    created_at: '2026-10-11T00:00:00.000Z',
    pinned: true,
  },
  {
    id: 'default-node-offline',
    name: 'Offline / stale',
    description: 'Nodes needing attention',
    type: 'node',
    filters: { status: 'offline' } as NodeFilter,
    created_at: '2026-10-11T00:00:00.000Z',
  },
  {
    id: 'default-message-queued',
    name: 'Queued messages',
    description: 'Messages waiting for node reconnect',
    type: 'message',
    filters: { status: 'QUEUED_FOR_NODE' } as MessageFilter,
    created_at: '2026-10-11T00:00:00.000Z',
    pinned: true,
  },
  {
    id: 'default-audit-incident',
    name: 'Incident actions',
    description: 'Audit entries for incident lifecycle',
    type: 'audit',
    filters: { entity_type: 'incident' } as AuditFilter,
    created_at: '2026-10-11T00:00:00.000Z',
    pinned: true,
  },
  {
    id: 'default-audit-node',
    name: 'Node actions',
    description: 'Audit entries for node operations',
    type: 'audit',
    filters: { entity_type: 'node' } as AuditFilter,
    created_at: '2026-10-11T00:00:00.000Z',
  },
]

export const useFilterPresets = create<PresetState>()(
  persist(
    (set, get) => ({
      presets: DEFAULT_PRESETS,

      addPreset: (type, name, description, filters) => {
        const id = genId()
        const preset: FilterPreset = {
          id,
          name,
          description,
          type,
          filters,
          created_at: new Date().toISOString(),
        }
        set((s) => ({ presets: [...s.presets, preset] }))
        return id
      },

      removePreset: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),

      renamePreset: (id, name) =>
        set((s) => ({
          presets: s.presets.map((p) => (p.id === id ? { ...p, name } : p)),
        })),

      togglePin: (id) =>
        set((s) => ({
          presets: s.presets.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)),
        })),

      hasPreset: (type, name) =>
        get().presets.some((p) => p.type === type && p.name.toLowerCase() === name.toLowerCase()),

      getPresets: (type) => get().presets.filter((p) => p.type === type),
    }),
    { name: 'resqnet-filter-presets' },
  ),
)
