'use client'

import { io, type Socket } from 'socket.io-client'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { titleCase } from '@/lib/format'
import { playAlert, unlockAudio } from '@/lib/sound'
import { useNotifPrefs, eventToAlertKey, alertKeyToSound } from '@/lib/notif-prefs'

export type RealtimeEvent = {
  event_id: string
  event_type: string
  occurred_at: string
  schema_version: string
  entity_id: string | null
  data: Record<string, unknown>
}

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

/**
 * Singleton socket.io manager. Connects once per dashboard session and:
 *   - syncs connection status into the zustand store (drives the banner)
 *   - on reconnect, calls `replay-since` to reconcile missed events
 *   - on each event, invalidates the relevant TanStack Query cache + shows a toast
 *
 * Per spec §8.3: "On reconnect, fetch changes since a known cursor or refetch
 * the relevant list/detail. WebSocket delivery alone should not be assumed durable."
 */
export function useRealtime() {
  const socketRef = useRef<Socket | null>(null)
  const cursorRef = useRef<number>(0)
  const user = useAppStore((s) => s.user)
  const setConnection = useAppStore((s) => s.setConnection)
  const setLastSyncAt = useAppStore((s) => s.setLastSyncAt)
  const setView = useAppStore((s) => s.setView)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [recentEvents, setRecentEvents] = useState<RealtimeEvent[]>([])
  const [operatorsOnline, setOperatorsOnline] = useState<
    { id: string; name: string; role: string; socket_count: number }[]
  >([])
  const qc = useQueryClient()

  useEffect(() => {
    if (!user) return
    // Connect via the Caddy gateway using XTransformPort.
    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      randomizationFactor: 0.4,
      withCredentials: true,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setStatus('connected')
      setConnection('connected')
      setLastSyncAt(new Date().toISOString())
    })

    socket.on('ready', (msg: { cursor: number; buffered_events: number; operator: { name: string; role: string } }) => {
      cursorRef.current = msg.cursor
      // On fresh connect, no replay needed (cursor is current).
      // On reconnect after disconnect, the 'reconnect' handler below triggers replay.
    })

    socket.on('replay', (msg: { since: number; count: number; events: RealtimeEvent[] }) => {
      if (msg.count > 0) {
        // Apply missed events to cache + toast for important ones
        for (const env of msg.events) {
          handleEvent(env, true)
        }
        const last = msg.events[msg.events.length - 1]
        cursorRef.current = Number(last.event_id.replace('evt-', ''))
        toast.info(`Reconciled ${msg.count} missed event(s) after reconnect.`)
      }
    })

    socket.on('event', (env: RealtimeEvent) => {
      handleEvent(env, false)
      cursorRef.current = Number(env.event_id.replace('evt-', ''))
    })

    socket.on('presence', (msg: { operators: { id: string; name: string; role: string; socket_count: number }[]; count: number }) => {
      setOperatorsOnline(msg.operators)
    })

    socket.on('disconnect', () => {
      setStatus('offline')
      setConnection('offline')
    })

    socket.on('reconnect_attempt', (attempt: number) => {
      setStatus('reconnecting')
      setConnection('reconnecting')
    })

    socket.on('reconnect', () => {
      setStatus('connected')
      setConnection('connected')
      setLastSyncAt(new Date().toISOString())
      // Ask the server for any events missed while disconnected
      socket.emit('replay-since', { cursor: cursorRef.current })
    })

    socket.on('connect_error', (err: Error) => {
      console.warn('[realtime] connect error:', err.message)
      setStatus('offline')
      setConnection('offline')
    })

    function handleEvent(env: RealtimeEvent, fromReplay: boolean) {
      // Track recent events for the live feed (cap 50)
      setRecentEvents((prev) => [env, ...prev].slice(0, 50))

      // Invalidate the relevant TanStack Query cache so components refetch
      const [domain, action] = env.event_type.split('.')
      if (domain === 'incident') {
        qc.invalidateQueries({ queryKey: ['incidents'] })
        qc.invalidateQueries({ queryKey: ['overview'] })
        if (env.entity_id) {
          qc.invalidateQueries({ queryKey: ['incident', env.entity_id] })
        }
      } else if (domain === 'node') {
        qc.invalidateQueries({ queryKey: ['nodes'] })
        qc.invalidateQueries({ queryKey: ['overview'] })
        if (env.entity_id) {
          qc.invalidateQueries({ queryKey: ['node', env.entity_id] })
        }
      }

      // Toast + sound only for high-signal events, and skip during replay to avoid floods
      if (!fromReplay) {
        const alertKey = eventToAlertKey(env.event_type, env.data)
        const shouldToast = alertKey ? useNotifPrefs.getState().shouldShowToast(alertKey) : false
        const shouldSound = alertKey ? useNotifPrefs.getState().shouldPlaySound(alertKey) : false

        if (shouldSound && alertKey) {
          playAlert(alertKeyToSound(alertKey))
        }

        if (shouldToast && alertKey) {
          const label = formatEventLabel(env.event_type)
          if (env.event_type === 'incident.created') {
            toast.success(`New SOS: ${env.entity_id}`, {
              description: String(env.data.category ?? '') + ' · ' + String(env.data.priority ?? ''),
              action: env.entity_id
                ? {
                    label: 'Open',
                    onClick: () => setView({ name: 'incident', incidentId: env.entity_id! }),
                  }
                : undefined,
            })
          } else if (env.event_type === 'node.displacement_warning') {
            toast.warning(`Displacement alert: ${env.entity_id}`, {
              description: 'Node moved beyond its deployment reference.',
            })
          } else if (env.event_type === 'incident.resolved') {
            toast.success(`Resolved: ${env.entity_id}`, {
              description: 'Incident marked as resolved.',
            })
          } else if (env.event_type === 'system.health_changed') {
            toast.info(label, { description: env.entity_id ?? 'Gateway health changed' })
          } else {
            toast.info(label, { description: env.entity_id ?? undefined })
          }
        }
      }
    }

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [user, qc, setConnection, setLastSyncAt, setView])

  return { status, recentEvents, operatorsOnline }
}

function formatEventLabel(eventType: string): string {
  return eventType
    .split(/[._]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
