'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Saved filter presets for the incident queue.
 *
 * Operators often apply the same filters repeatedly (e.g. "My critical open
 * incidents", "Unacknowledged SOS in the last hour"). This store persists
 * named filter combinations to localStorage so they can be recalled with one
 * click.
 */

export type IncidentFilter = {
  status?: string
  priority?: string
  category?: string
  q?: string
}

export type FilterPreset = {
  id: string
  name: string
  description: string
  filters: IncidentFilter
  created_at: string
  pinned?: boolean
}

type PresetState = {
  presets: FilterPreset[]
  addPreset: (name: string, description: string, filters: IncidentFilter) => string
  removePreset: (id: string) => void
  renamePreset: (id: string, name: string) => void
  togglePin: (id: string) => void
  hasPreset: (name: string) => boolean
}

function genId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// A few sensible defaults so the preset bar isn't empty on first use
const DEFAULT_PRESETS: FilterPreset[] = [
  {
    id: 'default-critical',
    name: 'Critical unacknowledged',
    description: 'CRITICAL priority, NEW status',
    filters: { priority: 'CRITICAL', status: 'NEW' },
    created_at: '2026-10-11T00:00:00.000Z',
    pinned: true,
  },
  {
    id: 'default-open',
    name: 'All open',
    description: 'All non-resolved incidents',
    filters: { status: 'all' },
    created_at: '2026-10-11T00:00:00.000Z',
  },
  {
    id: 'default-rescue',
    name: 'Rescue only',
    description: 'Rescue category, any status',
    filters: { category: 'RESCUE' },
    created_at: '2026-10-11T00:00:00.000Z',
  },
]

export const useFilterPresets = create<PresetState>()(
  persist(
    (set, get) => ({
      presets: DEFAULT_PRESETS,

      addPreset: (name, description, filters) => {
        const id = genId()
        const preset: FilterPreset = {
          id,
          name,
          description,
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

      hasPreset: (name) => get().presets.some((p) => p.name.toLowerCase() === name.toLowerCase()),
    }),
    { name: 'resqnet-filter-presets' },
  ),
)
