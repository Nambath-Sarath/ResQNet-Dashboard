'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Per-operator notification preferences (persisted to localStorage).
 * Controls which event types trigger sound alerts + toast notifications.
 */

export type AlertKey =
  | 'incident.created_critical'
  | 'incident.created_high'
  | 'incident.created_medium'
  | 'incident.created_low'
  | 'incident.resolved'
  | 'incident.acknowledged'
  | 'node.displacement_warning'
  | 'node.heartbeat_received'
  | 'node.capabilities_updated'
  | 'node.status_changed'
  | 'message.delivery_updated'
  | 'system.health_changed'

type PrefState = {
  // master toggles
  soundEnabled: boolean
  toastEnabled: boolean
  // per-event-type overrides (null = use master, true/false = override)
  soundOverrides: Partial<Record<AlertKey, boolean>>
  toastOverrides: Partial<Record<AlertKey, boolean>>
  // volume 0..1
  volume: number
  // actions
  setSoundEnabled: (v: boolean) => void
  setToastEnabled: (v: boolean) => void
  setVolume: (v: number) => void
  setSoundOverride: (key: AlertKey, value: boolean | null) => void
  setToastOverride: (key: AlertKey, value: boolean | null) => void
  shouldPlaySound: (key: AlertKey) => boolean
  shouldShowToast: (key: AlertKey) => boolean
}

export const useNotifPrefs = create<PrefState>()(
  persist(
    (set, get) => ({
      soundEnabled: true,
      toastEnabled: true,
      soundOverrides: {},
      toastOverrides: {},
      volume: 0.5,

      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setToastEnabled: (v) => set({ toastEnabled: v }),
      setVolume: (v) => set({ volume: v }),
      setSoundOverride: (key, value) =>
        set((s) => {
          const next = { ...s.soundOverrides }
          if (value === null) delete next[key]
          else next[key] = value
          return { soundOverrides: next }
        }),
      setToastOverride: (key, value) =>
        set((s) => {
          const next = { ...s.toastOverrides }
          if (value === null) delete next[key]
          else next[key] = value
          return { toastOverrides: next }
        }),

      shouldPlaySound: (key) => {
        const s = get()
        if (!s.soundEnabled) return false
        if (key in s.soundOverrides) return s.soundOverrides[key]!
        // Default: critical + displacement + offline get sound; others don't
        return (
          key === 'incident.created_critical' ||
          key === 'node.displacement_warning' ||
          key === 'system.health_changed'
        )
      },
      shouldShowToast: (key) => {
        const s = get()
        if (!s.toastEnabled) return false
        if (key in s.toastOverrides) return s.toastOverrides[key]!
        // Default: important events show toasts
        return (
          key === 'incident.created_critical' ||
          key === 'incident.created_high' ||
          key === 'incident.resolved' ||
          key === 'incident.acknowledged' ||
          key === 'node.displacement_warning' ||
          key === 'system.health_changed'
        )
      },
    }),
    { name: 'resqnet-notif-prefs' },
  ),
)

/**
 * Map a realtime event_type + data to an AlertKey.
 */
export function eventToAlertKey(
  eventType: string,
  data: Record<string, unknown>,
): AlertKey | null {
  // Normalize: "incident.created" + priority=CRITICAL → "incident.created_critical"
  if (eventType === 'incident.created') {
    const priority = String(data.priority ?? '').toUpperCase()
    if (priority === 'CRITICAL') return 'incident.created_critical'
    if (priority === 'HIGH') return 'incident.created_high'
    if (priority === 'MEDIUM') return 'incident.created_medium'
    return 'incident.created_low'
  }
  if (eventType === 'incident.resolved') return 'incident.resolved'
  if (eventType === 'incident.acknowledged') return 'incident.acknowledged'
  if (eventType === 'node.displacement_warning') return 'node.displacement_warning'
  if (eventType === 'node.heartbeat_received') return 'node.heartbeat_received'
  if (eventType === 'node.capabilities_updated') return 'node.capabilities_updated'
  if (eventType === 'node.status_changed') return 'node.status_changed'
  if (eventType === 'message.delivery_updated') return 'message.delivery_updated'
  if (eventType === 'system.health_changed') return 'system.health_changed'
  return null
}

/**
 * Map an AlertKey to a sound pattern name.
 */
export function alertKeyToSound(key: AlertKey): string {
  switch (key) {
    case 'incident.created_critical':
      return 'critical_new'
    case 'node.displacement_warning':
      return 'displacement'
    case 'system.health_changed':
      return 'offline'
    case 'incident.resolved':
      return 'resolve'
    case 'message.delivery_updated':
      return 'message'
    default:
      return 'message'
  }
}
