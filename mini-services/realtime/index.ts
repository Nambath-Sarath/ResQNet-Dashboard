// ResQNet realtime mini-service (socket.io) — port 3003 (dashboard) + 3004 (internal publish).
//
// Responsibilities:
//   1. Accept dashboard client connections via the Caddy gateway (path "/", ?XTransformPort=3003).
//   2. Authenticate the operator from the session cookie by querying the Next.js /api/v1/auth/me.
//   3. Accept publish requests from the Next.js API (localhost:3004/__publish) and fan-out
//      the corresponding event to subscribed dashboard clients.
//   4. Track an event cursor so reconnecting clients can request "events since cursor".
//
// All event envelopes follow spec §8.1:
//   { event_id, event_type, occurred_at, schema_version, entity_id, data }

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Server, type Socket } from 'socket.io'

const PORT = 3003 // dashboard-facing socket.io (via Caddy gateway)
const INTERNAL_PORT = 3004 // localhost-only HTTP for Next.js API publish
const NEXT_API_BASE = 'http://localhost:3000'
const SCHEMA_VERSION = '1.0'

// --- In-memory state ---------------------------------------------------------

type EventEnvelope = {
  event_id: string
  event_type: string
  occurred_at: string
  schema_version: string
  entity_id: string | null
  data: Record<string, unknown>
}

// Bounded ring buffer of recent events (for reconnect reconciliation)
const MAX_BUFFER = 500
const eventBuffer: EventEnvelope[] = []
let eventSeq = 0

// Track connected operators (id → socket count) for presence display
const operatorSockets = new Map<string, { name: string; role: string; sockets: Set<string> }>()

function publish(env: EventEnvelope) {
  eventBuffer.push(env)
  if (eventBuffer.length > MAX_BUFFER) {
    eventBuffer.splice(0, eventBuffer.length - MAX_BUFFER)
  }
  for (const socket of io.sockets.sockets.values()) {
    const state = clientState.get(socket)
    if (!state || state.subscribed.size === 0 || state.subscribed.has(env.event_type.toLowerCase())) {
      socket.emit('event', env)
    }
  }
  console.log(
    `[event] ${env.event_type} entity=${env.entity_id ?? '-'} → ${io.engine.clientsCount} client(s)`,
  )
}

// --- socket.io server (port 3003) --------------------------------------------

const httpServer = createServer((_req, res) => {
  // socket.io with path:'/' intercepts everything; this fallback should not normally run
  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found', hint: 'use socket.io client' }))
})

const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

type ClientState = {
  operatorId: string | null
  operatorName: string | null
  role: string | null
  subscribed: Set<string>
  cursor: number
}

const clientState = new WeakMap<Socket, ClientState>()

async function authenticateSocket(socket: Socket): Promise<ClientState | null> {
  const cookie = socket.handshake.headers.cookie ?? ''
  if (!cookie) return null
  try {
    const meRes = await fetch(`${NEXT_API_BASE}/api/v1/auth/me`, {
      headers: { cookie },
    })
    if (!meRes.ok) return null
    const me = (await meRes.json()) as
      | { authenticated: true; user: { id: string; display_name: string; role: string } }
      | { authenticated: false }
    if (!me.authenticated) return null
    return {
      operatorId: me.user.id,
      operatorName: me.user.display_name,
      role: me.user.role,
      subscribed: new Set(),
      cursor: eventSeq,
    }
  } catch (e) {
    console.error('[auth] failed to verify socket session:', e)
    return null
  }
}

io.use(async (socket, next) => {
  const state = await authenticateSocket(socket)
  if (!state) {
    next(new Error('unauthorized'))
    return
  }
  clientState.set(socket, state)
  next()
})

io.on('connection', (socket) => {
  const state = clientState.get(socket)
  if (!state) {
    socket.disconnect(true)
    return
  }

  console.log(
    `[connect] ${state.operatorName} (${state.role}) cursor=${state.cursor} sid=${socket.id}`,
  )

  if (state.operatorId) {
    const existing = operatorSockets.get(state.operatorId)
    if (existing) {
      existing.sockets.add(socket.id)
    } else {
      operatorSockets.set(state.operatorId, {
        name: state.operatorName ?? 'unknown',
        role: state.role ?? 'unknown',
        sockets: new Set([socket.id]),
      })
    }
  }
  broadcastPresence()

  socket.emit('ready', {
    server_time: new Date().toISOString(),
    cursor: state.cursor,
    buffered_events: eventBuffer.length,
    operator: { name: state.operatorName, role: state.role },
  })

  socket.on('subscribe', (types: string[]) => {
    state.subscribed = new Set(types.map((t) => t.toLowerCase()))
    socket.emit('subscribed', { types: Array.from(state.subscribed) })
  })

  socket.on('replay-since', (msg: { cursor?: number }) => {
    const since = msg.cursor ?? state.cursor
    const missed = eventBuffer.filter((e) => {
      const seq = Number(e.event_id.replace('evt-', ''))
      return seq > since
    })
    socket.emit('replay', { since, count: missed.length, events: missed })
    if (missed.length > 0) {
      state.cursor = Number(missed[missed.length - 1].event_id.replace('evt-', ''))
    }
    console.log(`[replay] ${state.operatorName}: ${missed.length} events since ${since}`)
  })

  socket.on('disconnect', () => {
    if (state.operatorId) {
      const entry = operatorSockets.get(state.operatorId)
      if (entry) {
        entry.sockets.delete(socket.id)
        if (entry.sockets.size === 0) operatorSockets.delete(state.operatorId)
      }
    }
    console.log(`[disconnect] ${state.operatorName} sid=${socket.id}`)
    broadcastPresence()
  })
})

function broadcastPresence() {
  const operators = Array.from(operatorSockets.entries()).map(([id, info]) => ({
    id,
    name: info.name,
    role: info.role,
    socket_count: info.sockets.size,
  }))
  io.emit('presence', { operators, count: operators.length })
}

// --- internal HTTP server (port 3004) ----------------------------------------
// Next.js API routes POST here to fan out an event to all dashboards.

const internalServer = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://localhost:${INTERNAL_PORT}`)

    if (url.pathname === '/__health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'resqnet-realtime',
          connections: io.engine.clientsCount,
          buffered_events: eventBuffer.length,
          cursor: eventSeq,
          operators_online: operatorSockets.size,
        }),
      )
      return
    }

    if (url.pathname === '/__publish' && req.method === 'POST') {
      const remote = req.socket.remoteAddress ?? ''
      const isLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)
      if (!isLocal) {
        res.writeHead(403, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'forbidden', remote }))
        return
      }
      let body = ''
      for await (const chunk of req) body += chunk
      try {
        const parsed = JSON.parse(body) as {
          event_type: string
          entity_id?: string | null
          data?: Record<string, unknown>
          occurred_at?: string
        }
        const env: EventEnvelope = {
          event_id: `evt-${++eventSeq}`,
          event_type: parsed.event_type,
          occurred_at: parsed.occurred_at ?? new Date().toISOString(),
          schema_version: SCHEMA_VERSION,
          entity_id: parsed.entity_id ?? null,
          data: parsed.data ?? {},
        }
        publish(env)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, event_id: env.event_id, delivered_to: io.engine.clientsCount }))
      } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid body', detail: String(e) }))
      }
      return
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  },
)

httpServer.listen(PORT, () => {
  console.log(`[resqnet-realtime] socket.io dashboard server on :${PORT}`)
})
internalServer.listen(INTERNAL_PORT, '127.0.0.1', () => {
  console.log(`[resqnet-realtime] internal publish API on 127.0.0.1:${INTERNAL_PORT}`)
})

process.on('SIGTERM', () => {
  console.log('[resqnet-realtime] SIGTERM, shutting down')
  io.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  console.log('[resqnet-realtime] SIGINT, shutting down')
  io.close(() => process.exit(0))
})
