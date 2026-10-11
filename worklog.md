# ResQNet Command Dashboard — Worklog

Project: ResQNet — Local-First Disaster Response & Resource Coordination Platform
Target: Next.js 16 (App Router) + TypeScript + Tailwind 4 + shadcn/ui + Prisma (SQLite)
Spec: `/home/z/my-project/upload/ResQNet_Command_Dashboard_Specification.md`

---

## Phase 0 — Architecture Decisions (Recorded)

The spec lists Phase 0 as "decisions that must be recorded before build." The full spec targets Python FastAPI + SQLite + React+Vite. For this Next.js implementation we adapt the stack while preserving the spec's intent (local-first, single-Pi gateway, REST + WebSocket, SQLite, capability-driven UI, audit trail). Decisions:

| Decision | ResQNet spec | This implementation |
|---|---|---|
| Dashboard host | React + Vite static assets on Pi | Next.js 16 App Router on port 3000 (gateway: Caddy) |
| API | Python FastAPI under `/api/v1` | Next.js Route Handlers under `/api/v1/*` (same origin, no CORS) |
| Database | SQLite via SQLAlchemy + Alembic | SQLite via Prisma (`prisma/schema.prisma` + `bun run db:push`) |
| Realtime | FastAPI WebSockets `/api/v1/ws` | socket.io mini-service on port 3003, gateway-proxied via `?XTransformPort=3003` |
| Auth | Local operator auth, hashed passwords, sessions | Local hashed-password auth (bcrypt), httpOnly session cookie + zustand client mirror |
| Maps | Leaflet + offline tile package | Leaflet (loaded client-side) + OSM tiles for MVP; offline-package hook documented but not bundled in Stage 1 |
| Node transport | Pick one of Wi-Fi/IP, ESP-NOW, LoRa | Wi-Fi/IP (HTTP) assumed for the simulator/seed data; node identity via per-node secret in `nodes.auth_secret` |
| Node identity | Per-node secret, replay protection | `nodes.auth_secret` + monotonic `last_sequence` checked on heartbeat/capability submits |
| Capability schema | JSON descriptor, allowlist, versioned | `capability_reports.descriptor_json` validated against allowlist in API route (Stage 4 will harden) |
| Idempotency | `client_submission_id` for SOS | `incidents.client_submission_id` unique per source_node_id |
| Timestamps | ISO 8601 UTC | All `DateTime @default(now())` stored as UTC; UI formats to local |
| Roles | viewer/dispatcher/field-coord/tech/admin | Enum `OperatorRole`; centralized `requireRole()` helper in API |
| Audit | Append-only audit_logs + incident_events | Both tables modeled; API writes audit entries on state-changing actions |

### Stage plan (mapping spec phases → deliverables)

- **Stage 1 (this push)** = Phase 0 (decisions) + Phase 1 (local API + DB + auth + health + nodes + incidents) + Phase 2 (dashboard shell: login, sidebar/topbar/connection banner, Overview, Node List, Node Details, Incident Queue, Incident Detail). Real API, seeded mock data, visible in browser.
- **Stage 2** = Phase 3 (end-to-end SOS flow + socket.io realtime + incident lifecycle transitions + audit trail) + Phase 4 (capability-driven dynamic module UI + deployment-reference locking + displacement handling).
- **Stage 3** = Phase 5 (Leaflet situation map, survivor registry, messages, resources, shelters, reports, audit, settings).
- **Stage 4** = Phase 6 (resilience: stale-data banner, reconnect reconciliation, offline-mode UX, simulated node queue + duplicate handling, backup/restore surface).

### Stage 1 — Status
- Started. Building schema → seed → API → frontend shell.

---
Task ID: stage-1
Agent: main (Z.ai Code)
Task: Stage 1 — Phase 0 (architecture decisions) + Phase 1 (local API & DB) + Phase 2 (dashboard shell) for the ResQNet Command Dashboard.

Work Log:
- Recorded Phase 0 architecture decisions (stack adaptation: Next.js 16 + Prisma/SQLite + socket.io mini-service planned for Stage 2; role-based auth; per-node secrets; idempotency; UTC timestamps; audit trail).
- Defined full Prisma schema in `prisma/schema.prisma` covering all spec §9 tables: operators, operator_sessions, nodes, node_heartbeats, node_locations, capability_reports, modules, node_events, incidents, incident_events, incident_notes, survivors, messages, message_attempts, resources, resource_requests, shelters, audit_logs, system_events. Added enums for OperatorRole, NodeLifecycle, ModuleStatus, IncidentStatus/Priority/Category, MessageStatus.
- Wrote `prisma/seed.ts` with realistic mock data: 5 operators (admin/dispatcher/tech/field/viewer, password `resqnet123`), 6 nodes (4 online, 1 offline, 1 stale/maintenance) with heartbeats/locations/modules/events/capability_reports, 10 incidents across all lifecycle states, 4 survivors, 4 messages with attempts, 5 resources, 3 shelters, 5 audit logs, 4 system events.
- Built API routes under `/api/v1/*`: health, auth/login+logout+me (bcrypt + httpOnly session cookie + 12h TTL + naive rate-limit + audit), overview (aggregated metrics), nodes (list+register) + nodes/[id] (detail+patch), incidents (list+create with idempotency) + incidents/[id] (detail+patch with status-transition validation + notes).
- Added shared auth lib (`src/lib/auth.ts`) with login/logout/requireOperator/requireRole/audit/errorResponse helpers.
- Built frontend: theme (dark-first ResQNet palette — graphite sidebar + amber accent, NO indigo/blue), zustand store for auth+nav+connection, TanStack Query provider + typed hooks, typed API client with error envelope.
- Built dashboard shell: collapsible dark Sidebar with 4 nav sections + critical-incident ping indicator, MobileNav (Sheet), TopBar (breadcrumb + gateway status pills + theme switcher + user menu), ConnectionBanner (stale/offline warning), sticky Footer (uptime/db/server time/realtime link).
- Built pages: LoginPage (split-screen brand panel + form + 5 demo accounts), OverviewPage (4 summary cards + priority queue + gateway health + node health table + recent activity timeline), NodeListPage (filter bar + table + card grid), NodeDetailPage (5 tabs: Overview/Location/Modules/Events/Incidents), IncidentQueuePage (status+priority filters + table + critical card grid), IncidentDetailPage (header + action bar with lifecycle transitions + location + timeline + notes + metadata + delivery-state card), ComingSoon for Stage 3 views.
- Built shared UI: StatusBadge (+StatusDot with pulse), FreshnessLabel, BatteryIndicator + LinkQualityBar, state views (Loading/Empty/Error/Forbidden/StaleData), formatting helpers (timeAgo, formatDateTime, formatCoord, formatUptime, staleness, battery/rssi status, label maps).
- Fixed Prisma schema: added `IncidentNote.author` relation to Operator (was causing 500 on incident detail GET).
- Verified with agent-browser: login → overview (4 online / 1 offline / 1 stale / 3 new SOS / 2 critical) → click incident SOS-1042 → detail page → click Acknowledge → state transitions to ACKNOWLEDGED, toast confirms, "Start work" button appears → navigate to node → 5 tabs render → Modules tab shows GPS/Camera/IMU with capabilities. No runtime errors in console. Lint clean (0 errors). Mobile viewport renders.
- Started dev server with `setsid` daemonization so it persists across bash calls.

Stage Summary:
- Stage 1 is feature-complete and browser-verified. All spec Phase 0/1/2 acceptance items are met: operator sign-in, navigation, API/gateway state visible, loading/empty/error/stale states designed, node registration endpoint + heartbeats, capability reports stored, incident creation with idempotency, status transitions validated on backend, audit trail written for sensitive actions.
- Demo login: `admin` / `resqnet123` (also dispatcher/tech/field/viewer, same password).
- Next stage (Stage 2) will add: Phase 3 end-to-end SOS flow with socket.io realtime mini-service (port 3003) + reconnect reconciliation, and Phase 4 capability-driven dynamic module UI hardening + deployment-reference locking + conservative displacement detection.
- Unresolved notes: the 5-minute heartbeat staleness threshold means seeded data goes "stale" after 5 min — re-seed (`bun run db:seed`) to refresh for demos. The dev server caches the DB file handle, so a DB reset requires restarting `bun run dev`.

---
Task ID: stage-2
Agent: main (Z.ai Code) — cron-triggered 15-minute review
Task: Stage 2 — Phase 3 (socket.io realtime SOS flow + reconnect reconciliation) + Phase 4 (capability-driven dynamic module UI + deployment-reference locking + displacement detection). Plus styling polish + new features.

Work Log:
- QA pass (Stage 1 stable): re-seeded DB, restarted dev server, agent-browser smoke test confirmed login → overview → incident detail → acknowledge lifecycle → node detail → modules tab all working with no console errors.
- Built socket.io realtime mini-service (`mini-services/realtime/index.ts`) on port 3003 (dashboard-facing socket.io with path `/`) + port 3004 (localhost-only internal publish API). Authenticates each socket via the session cookie → `/api/v1/auth/me`. Maintains a bounded ring buffer (500 events) for reconnect reconciliation. Tracks operator presence.
- Added `src/lib/realtime.ts` `publishEvent()` helper (fire-and-forget POST to localhost:3004/__publish).
- Wired realtime event publishing into the API: `POST /api/v1/incidents` publishes `incident.created`; `PATCH /api/v1/incidents/[id]` publishes `incident.acknowledged/assigned/resolved/cancelled/priority_changed/updated` per transition; `POST /api/v1/incidents/[id]/notes` publishes `incident.note_added`; new `POST /api/v1/nodes/[id]/heartbeats` publishes `node.heartbeat_received` (+ `node.displacement_warning` if threshold exceeded); new `POST /api/v1/nodes/[id]/capabilities` publishes `node.capabilities_updated`; new `POST /api/v1/nodes/[id]/deployment` publishes `node.deployment_updated`.
- Built `src/lib/use-realtime.ts` hook: connects via `io('/?XTransformPort=3003')`, syncs connection status → zustand store, on reconnect calls `replay-since` with the last cursor to reconcile missed events, deduplicates by event_id, invalidates the relevant TanStack Query cache on each event, and shows toast notifications for high-signal events (incident.created → "New SOS" with Open action; node.displacement_warning).
- Built `RealtimeEventFeedButton` (`src/components/dashboard/realtime-feed.tsx`): floating bell button (bottom-right) with unread badge + connection status dot. Opens a right-side Sheet showing the live event stream (clickable rows → navigate to the incident/node) + "Operators online" presence list.
- Wired the realtime hook into `DashboardShell` — dispatches a custom `resqnet:rt` event so the feed button updates without prop drilling.
- Built `POST /api/v1/nodes/[id]/deployment` (NODE_TECHNICIAN/ADMIN only): validates coordinates, requires explicit `confirm:true` when the node is already DEPLOYED, writes an audit entry + `node_events` row + realtime event. Returns 409 with current reference if confirmation is missing.
- Built `POST /api/v1/nodes/[id]/heartbeats` (node-secret auth via `X-Node-Secret` header): stores heartbeat, computes health_state (OK/DEGRADED based on battery/link), optional location ping with **conservative displacement detection** (Haversine distance > 200m AND accuracy < 30m — a single noisy reading does NOT trigger an alert; spec §12.4).
- Built `POST /api/v1/nodes/[id]/capabilities` (node-secret auth): validates module types against an allowlist (GPS/CAMERA/IMU/ENVIRONMENT/LORA/BATTERY/STORAGE/DISPLAY), rejects unknown types with `ALLOWLIST_VIOLATION`, upserts the `modules` table, updates node firmware/protocol, publishes a realtime event.
- Built `GET /api/v1/nodes/[id]/secret` (ADMIN only): returns the node's auth_secret so the dashboard simulator can post authenticated heartbeats/capabilities. (Renamed from `__secret` because Next.js App Router didn't pick up the double-underscore folder.)
- Built `DeploymentLockCard` (`src/components/pages/deployment-lock-card.tsx`): shows locked reference + accuracy + locked-by/at, with an edit dialog that requires confirmation for deployed nodes and calls the deployment API.
- Built `DynamicModuleGrid` (`src/components/pages/dynamic-module-grid.tsx`): renders capability-driven controls per module type — GPS (current fix or "no fix" message, never stale as current), Camera (Request photo capture button, disabled if offline or missing capability), IMU (motion/tilt readings), Environment (temp/humidity/pressure metrics). Unknown module types are shown as UNKNOWN with a safe diagnostic message — never rendered as controls. Spec §6.6 dynamic UI rules fully implemented.
- Built `NodeSimulatorPanel` (`src/components/pages/node-simulator-panel.tsx`, admin only): sliders for battery/link/clients/uptime, RSSI input, optional GPS location ping with a "Simulate displacement" toggle, capability report presets (GPS only / GPS+Camera / GPS+IMU+Environment / GPS+Unknown(rejected) / Empty). Posts authenticated heartbeats + capability reports to exercise the realtime pipeline.
- Built `QuickIncidentComposer` (`src/components/pages/quick-incident-composer.tsx`): dialog for operators to create an SOS manually with category/priority/description/people/location. Added to both the Overview page header and the Incident Queue filter bar.
- Styling polish: added a "Welcome, {operator}" context strip with live timestamp + quick composer on the overview; added an info banner on the Modules tab explaining the capability-validated rendering rule; improved the realtime feed drawer with operator presence pills and clickable event rows.
- Fixed lint errors: escaped `>` in JSX text, refactored set-state-in-effect warnings in realtime-feed (moved seen-count update into the onOpenChange callback), removed unused eslint-disable in use-realtime, fixed dependency array.

Verification (agent-browser through Caddy gateway on port 81):
- ✅ Login → overview shows "Welcome, Avery Chen" + New incident button.
- ✅ Created SOS-1011 via composer → toast "Incident SOS-1011 created. Realtime event published to all dashboards." → incident immediately appears in priority queue (cache invalidation worked).
- ✅ Created SOS-1012 → same flow, realtime cursor advanced to 2.
- ✅ Navigated to NODE-001 → Location tab → DeploymentLockCard shows "Update reference" button → NodeSimulatorPanel shows sliders + Send heartbeat + Submit capability buttons.
- ✅ Clicked "Send heartbeat" → toast "Heartbeat accepted. health_state=OK" → realtime cursor advanced to 3 (`node.heartbeat_received` published).
- ✅ Clicked "Submit capability report" (GPS+Camera preset) → realtime cursor advanced to 4 (`node.capabilities_updated` published) → Modules tab now shows GPS/Camera/IMU with capabilities + "Request photo capture" button.
- ✅ Opened live event feed (bell button) → drawer shows "Node Capabilities Updated NODE-001 just now" + "Node Heartbeat Received NODE-001 0m ago" + operators online count.
- ✅ Realtime service health: `connections: 2, operators_online: 1, buffered_events: 4, cursor: 4`.
- ✅ `bun run lint` clean (0 errors). No console errors.

Stage Summary:
- Stage 2 is feature-complete and browser-verified. All spec Phase 3 + Phase 4 acceptance items are met: socket.io realtime event stream, reconnect reconciliation via cursor replay, incident lifecycle events published after DB commit, capability-driven dynamic module UI rendered from validated reports only, deployment-reference locking with confirmation + audit, conservative displacement detection (>200m + <30m accuracy).
- The realtime pipeline is fully circular: dashboard action → API → DB → publish → socket.io → all dashboards update via cache invalidation + toast.
- Next stage (Stage 3) will add: Leaflet situation map, survivor registry, messages, resources, shelters, reports, audit log, settings pages (currently Coming Soon placeholders).
- Unresolved notes: the socket.io connection only works when the dashboard is accessed through the Caddy gateway (port 81) — direct localhost:3000 access times out because the `?XTransformPort=3003` query isn't forwarded. This is expected behavior. The dev server + realtime mini-service both need to be running (`bun run dev` + `cd mini-services/realtime && bun index.ts`).
