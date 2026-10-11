'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Offline write-queue + network-status store (spec §11.1).
 *
 * When the dashboard-to-Pi API is unreachable, the dashboard must NOT let writes
 * appear successful. Instead, mutating requests are queued locally with a stable
 * client submission ID, and replayed on reconnect with idempotency.
 *
 * Spec §11.1: "Do not allow writes to appear successful while the API is unavailable.
 * Reconnect automatically with backoff. Re-fetch authoritative records after reconnecting."
 */

export type QueuedWrite = {
  id: string // local UUID
  client_submission_id: string // idempotency key for the API
  endpoint: string // e.g. /api/v1/incidents
  method: 'POST' | 'PATCH' | 'DELETE'
  body: unknown
  description: string // human label for the UI
  created_at: string
  attempts: number
  last_error: string | null
  status: 'pending' | 'in_flight' | 'succeeded' | 'failed'
  kind: 'incident' | 'message' | 'resource' | 'shelter' | 'note' | 'other'
}

type ResilienceState = {
  // network
  online: boolean
  apiReachable: boolean
  lastOnlineAt: string | null
  lastOfflineAt: string | null
  consecutiveFailures: number
  // write queue
  queue: QueuedWrite[]
  // actions
  setOnline: (online: boolean) => void
  setApiReachable: (reachable: boolean) => void
  recordFailure: () => void
  recordSuccess: () => void
  enqueue: (write: Omit<QueuedWrite, 'id' | 'client_submission_id' | 'created_at' | 'attempts' | 'last_error' | 'status'>) => string
  markInFlight: (id: string) => void
  markSucceeded: (id: string) => void
  markFailed: (id: string, error: string) => void
  remove: (id: string) => void
  clearSucceeded: () => void
  retry: (id: string) => void
}

function genId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const useResilienceStore = create<ResilienceState>()(
  persist(
    (set, get) => ({
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      apiReachable: true,
      lastOnlineAt: null,
      lastOfflineAt: null,
      consecutiveFailures: 0,
      queue: [],

      setOnline: (online) =>
        set((s) => ({
          online,
          ...(online
            ? { lastOnlineAt: new Date().toISOString() }
            : { lastOfflineAt: new Date().toISOString() }),
        })),

      setApiReachable: (reachable) =>
        set(() => ({
          apiReachable: reachable,
          ...(reachable ? { consecutiveFailures: 0 } : {}),
        })),

      recordFailure: () =>
        set((s) => ({
          consecutiveFailures: s.consecutiveFailures + 1,
          apiReachable: s.consecutiveFailures + 1 >= 2 ? false : s.apiReachable,
        })),

      recordSuccess: () =>
        set(() => ({ consecutiveFailures: 0, apiReachable: true })),

      enqueue: (write) => {
        const id = genId()
        const client_submission_id = `local-${genId().slice(0, 12)}`
        const entry: QueuedWrite = {
          ...write,
          id,
          client_submission_id,
          created_at: new Date().toISOString(),
          attempts: 0,
          last_error: null,
          status: 'pending',
        }
        set((s) => ({ queue: [...s.queue, entry] }))
        return id
      },

      markInFlight: (id) =>
        set((s) => ({
          queue: s.queue.map((q) =>
            q.id === id ? { ...q, status: 'in_flight', attempts: q.attempts + 1 } : q,
          ),
        })),

      markSucceeded: (id) =>
        set((s) => ({
          queue: s.queue.map((q) =>
            q.id === id ? { ...q, status: 'succeeded', last_error: null } : q,
          ),
        })),

      markFailed: (id, error) =>
        set((s) => ({
          queue: s.queue.map((q) =>
            q.id === id ? { ...q, status: 'failed', last_error: error } : q,
          ),
        })),

      remove: (id) => set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),

      clearSucceeded: () => set((s) => ({ queue: s.queue.filter((q) => q.status !== 'succeeded') })),

      retry: (id) =>
        set((s) => ({
          queue: s.queue.map((q) =>
            q.id === id ? { ...q, status: 'pending', last_error: null } : q,
          ),
        })),
    }),
    {
      name: 'resqnet-resilience',
      partialize: (s) => ({ queue: s.queue }),
    },
  ),
)
