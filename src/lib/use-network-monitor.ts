'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useResilienceStore } from '@/lib/resilience-store'
import { api, ApiRequestError } from '@/lib/api-client'

/**
 * Network monitor + offline write-queue replay engine.
 *
 * Spec §11.1: "Show that the API is unreachable and mark displayed server data stale.
 * Do not allow writes to appear successful while the API is unavailable. Reconnect
 * automatically with backoff. Re-fetch authoritative records after reconnecting."
 *
 * This hook:
 *   1. Listens to browser online/offline events.
 *   2. Polls /api/v1/health every 30s when online, every 10s when degraded.
 *   3. Drives the resilience store (online, apiReachable, consecutiveFailures).
 *   4. When the API is reachable again, replays any queued writes with idempotency.
 *   5. Triggers a full TanStack Query cache invalidation on reconnect.
 */
export function useNetworkMonitor() {
  const qc = useQueryClient()
  const setOnline = useResilienceStore((s) => s.setOnline)
  const setApiReachable = useResilienceStore((s) => s.setApiReachable)
  const recordFailure = useResilienceStore((s) => s.recordFailure)
  const recordSuccess = useResilienceStore((s) => s.recordSuccess)
  const queue = useResilienceStore((s) => s.queue)
  const markInFlight = useResilienceStore((s) => s.markInFlight)
  const markSucceeded = useResilienceStore((s) => s.markSucceeded)
  const markFailed = useResilienceStore((s) => s.markFailed)
  const remove = useResilienceStore((s) => s.remove)

  // Track the last health probe time so we don't spam during reconnect storms.
  const lastProbeRef = useRef<number>(0)
  const replayingRef = useRef<boolean>(false)

  // Health probe function (declared before the online/offline listener that uses it)
  const probeHealth = useCallback(
    async (force: boolean) => {
      const now = Date.now()
      const apiReachable = useResilienceStore.getState().apiReachable
      const minInterval = apiReachable ? 30_000 : 10_000
      if (!force && now - lastProbeRef.current < minInterval) return
      lastProbeRef.current = now
      try {
        const res = await fetch('/api/v1/health', { cache: 'no-store' })
        if (res.ok) {
          recordSuccess()
        } else {
          recordFailure()
        }
      } catch {
        recordFailure()
      }
    },
    [recordSuccess, recordFailure],
  )

  // Browser online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      // Probe health immediately on browser reconnect
      probeHealth(true)
    }
    const handleOffline = () => {
      setOnline(false)
      setApiReachable(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setOnline, setApiReachable, probeHealth])

  // Periodic health polling
  useEffect(() => {
    probeHealth(true)
    const interval = setInterval(() => probeHealth(false), 15_000)
    return () => clearInterval(interval)
  }, [probeHealth])

  // Replay queued writes when API becomes reachable
  const apiReachable = useResilienceStore((s) => s.apiReachable)
  useEffect(() => {
    if (!apiReachable || replayingRef.current) return
    const pending = queue.filter((q) => q.status === 'pending' || q.status === 'failed')
    if (pending.length === 0) return

    replayingRef.current = true
    ;(async () => {
      for (const write of pending) {
        markInFlight(write.id)
        try {
          const body = {
            ...(write.body && typeof write.body === 'object' ? write.body : {}),
            client_submission_id: write.client_submission_id,
          }
          if (write.method === 'POST') {
            await api.post(write.endpoint, body)
          } else if (write.method === 'PATCH') {
            await api.patch(write.endpoint, body)
          } else {
            await api.delete(write.endpoint)
          }
          markSucceeded(write.id)
        } catch (e) {
          const msg = e instanceof ApiRequestError ? e.message : String(e)
          markFailed(write.id, msg)
          // If we hit a network error again, stop replaying
          if (e instanceof ApiRequestError && e.status >= 500) {
            recordFailure()
            break
          }
        }
      }
      replayingRef.current = false
      // After replay, refetch everything
      qc.invalidateQueries()
    })()
  }, [apiReachable, queue, markInFlight, markSucceeded, markFailed, remove, recordFailure, qc])

  // On API recovery, refetch authoritative state
  const prevReachable = useRef<boolean>(true)
  useEffect(() => {
    if (!prevReachable.current && apiReachable) {
      // Just came back online — refetch everything
      qc.invalidateQueries()
    }
    prevReachable.current = apiReachable
  }, [apiReachable, qc])
}
