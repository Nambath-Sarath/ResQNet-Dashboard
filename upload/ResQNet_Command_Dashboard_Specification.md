# ResQNet — Command Dashboard Web App Specification

**Document type:** Product, UX, architecture, and implementation specification  
**Project:** ResQNet — Local-First Disaster Response and Resource Coordination Platform  
**Target host:** Raspberry Pi gateway/control center  
**Status:** Proposed design for implementation; not a claim that these features already exist  

---

## 1. Purpose

The ResQNet Command Dashboard is the operator-facing web application used to monitor rescue nodes, review SOS reports, coordinate response work, inspect optional hardware modules, and manage local disaster-response information when internet access is unavailable.

The dashboard is one client of the ResQNet backend. It is not the backend, database, or radio network itself.

### 1.1 Core operating principle

**Survivor Portal and Command Dashboard do not send data directly to each other.** Each client communicates with backend services. The backend validates requests, writes the authoritative records to the database, and distributes updates to authorized dashboard clients.

- The **Survivor Portal** submits SOS reports, location information, messages, and resource requests.
- An **ESP32 node** provides nearby Wi-Fi access and forwards information over the configured node-to-gateway transport. If the gateway is unreachable, supported messages may be queued locally and forwarded later.
- The **Raspberry Pi** runs the API, database, event service, map service, and Command Dashboard hosting.
- The **Command Dashboard** retrieves records, shows live and last-known state, and sends operator actions back to the API.

### 1.2 Goals

1. Give operators one place to inspect the response situation and identify work requiring attention.
2. Receive and track SOS and other incident reports.
3. Register and monitor ESP32 nodes, their health, deployment locations, and capabilities.
4. Render node-specific module controls from validated capability reports instead of assuming all nodes have the same hardware.
5. Make stale data, disconnected nodes, and failed communication obvious.
6. Keep essential operations local and useful without internet access.
7. Maintain an auditable history of incident changes and sensitive operator actions.
8. Provide stable APIs so the Survivor Portal, nodes, and dashboard can evolve independently.

### 1.3 Non-goals for the first release

The first release should not claim to provide:

- Guaranteed communication through rubble, water, or arbitrary distances.
- Precise survivor positioning based on the connected node's coverage area or Wi-Fi signal strength.
- General-purpose Wi-Fi repeating through a chain of single-radio ESP32 boards without a tested network design.
- Automatic identification of arbitrary hardware modules without an implemented discovery protocol.
- Fully autonomous rescue decisions or clinically reliable medical triage.
- Cloud dependence for core local operations.
- A production-grade, multi-region mission-control platform.

These limitations should be reflected in the UI, documentation, and test plan.

---

## 2. Proposed technology stack

Use a stack that is easy to develop, test, and run locally on a Raspberry Pi.

| Layer | Proposed technology | Responsibility |
|---|---|---|
| Command Dashboard | React + TypeScript + Vite | Operator UI, navigation, client-side state, forms, filters |
| Styling | Tailwind CSS or CSS modules | Consistent responsive design and component styling |
| Routing | React Router | Page navigation and nested detail pages |
| Server-state cache | TanStack Query or a small typed API/state layer | Fetching, caching, retries, invalidation |
| Maps | Leaflet | Map interaction, markers, layers |
| Offline map data | Preloaded local tile package or another legally suitable offline map source | Maps without internet |
| API | Python + FastAPI | Authentication, validation, business rules, persistence, API and WebSocket events |
| Database | SQLite initially | Authoritative local records on the Pi |
| ORM/migrations | SQLAlchemy + Alembic, or equivalent migration tooling | Database access and schema evolution |
| Realtime updates | FastAPI WebSockets; REST fallback | New incidents, node health, messages, and status changes |
| Node firmware | ESP-IDF preferred; Arduino acceptable for a fast prototype | Node operation and hardware interfaces |
| Deployment | systemd services; reverse proxy only if needed | Reliable boot, restart, and local service management |
| Version control | Git | Code history, branches, reviews, releases |

### 2.1 Frontend choice

React is appropriate for the Pi-hosted dashboard because it contains several related, data-heavy pages, reusable tables and filters, live status indicators, maps, and dynamic module panels. Keep the ESP32 Survivor Portal much lighter; a small HTML/CSS/JavaScript page is generally a better fit for ESP32 memory and flash limits.

### 2.2 Dependency policy

Do not hard-code assumed “latest” library versions into this specification. At project setup, choose supported versions, pin dependencies in the lockfiles, record the Node/Python versions, and test the chosen set on the actual Pi. Avoid upgrading dependencies during an emergency deployment without regression testing.

### 2.3 Suggested repository layout

A monorepo is convenient for a student/team project because API contracts, firmware descriptors, and UI code can be versioned together.

```text
resqnet/
├── apps/
│   ├── command-dashboard/             # React + TypeScript + Vite
│   │   ├── src/
│   │   │   ├── app/                   # App entry, router, providers
│   │   │   ├── layouts/               # Dashboard and authentication layouts
│   │   │   ├── pages/                 # Route-level page components
│   │   │   ├── features/               # incidents, nodes, modules, resources
│   │   │   ├── components/             # shared UI components
│   │   │   ├── services/               # REST client, WebSocket client
│   │   │   ├── hooks/                  # shared React hooks
│   │   │   ├── types/                  # generated or hand-maintained API types
│   │   │   └── utils/                  # formatting, validation helpers
│   │   ├── public/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   └── survivor-portal/               # separate, lightweight portal if developed here
├── services/
│   └── api/
│       ├── app/
│       │   ├── main.py
│       │   ├── api/                   # routers and request/response schemas
│       │   ├── auth/
│       │   ├── models/                # ORM/database models
│       │   ├── services/              # business rules
│       │   ├── repositories/           # database access
│       │   ├── events/                # WebSocket/event broker
│       │   ├── node_protocol/         # node authentication and descriptors
│       │   └── config.py
│       ├── migrations/
│       ├── tests/
│       ├── pyproject.toml
│       └── requirements.lock          # or equivalent lockfile
├── firmware/
│   └── esp32-node/
├── contracts/
│   ├── openapi/                       # exported API schema if needed
│   ├── capability-descriptor.schema.json
│   └── event-envelope.schema.json
├── docs/
├── deployment/
│   ├── systemd/
│   └── scripts/
└── README.md
```

The directories are a suggested organization, not a requirement to implement every folder immediately. Start with the smallest structure that stays understandable.

---

## 3. System architecture

### 3.1 High-level flow

```text
                       LOCAL RESPONSE NETWORK

 Survivor phone                                      Operator browser
      |                                                     |
      v                                                     v
 Survivor Portal                                     Command Dashboard
      |                                                     |
      | HTTP/API through a reachable local path             | REST + WebSocket
      v                                                     v
+----------------------+                       +--------------------------+
| ESP32 rescue node(s) | <--- node transport -->| Raspberry Pi gateway     |
| - local Wi-Fi access |                       | - FastAPI API            |
| - optional modules   |                       | - incident/business logic|
| - limited local queue|                       | - WebSocket event service|
+----------------------+                       | - SQLite database        |
                                               | - offline map assets     |
                                               | - built dashboard assets |
                                               +--------------------------+
```

The diagram is conceptual. It does not define a working radio topology by itself. The node-to-Pi transport must be selected, implemented, and tested independently.

### 3.2 The database is not connected directly to the web pages

The recommended data flow is:

1. A client sends a request to the API.
2. The API validates the identity, schema, and permissions.
3. The API applies business rules and stores the change in SQLite.
4. After the transaction succeeds, the API publishes an event to connected authorized dashboard clients.
5. The dashboard updates its view or refetches the authoritative record.

Do not expose the SQLite file to browser JavaScript. Do not place database credentials in the frontend bundle.

### 3.3 Where to host the dashboard

Recommended initial deployment: build the React app into static assets and serve those assets from the Pi, using FastAPI static-file support or a small local web server/reverse proxy. Keep the API under a stable path such as `/api` and WebSockets under `/api/ws`. This makes the dashboard and API share the same origin and reduces CORS complexity.

A separate web server is also acceptable, but its routing, origin, authentication, and offline behavior must be configured deliberately.

### 3.4 Survivor Portal access is a separate networking problem

Serving the Survivor Portal from an ESP32 does not automatically give it access to the Pi API. If the page and API are hosted at different addresses, browser origin rules, CORS, routing, and secure-context restrictions must be addressed and tested on actual Android and iOS devices.

Browser geolocation generally requires a secure context. A plain HTTP page served by a local IP address may not be allowed to use the Geolocation API. Do not promise browser-based GPS sharing until the chosen portal delivery method has been tested. Possible alternatives involve a carefully configured HTTPS approach, a native app, or a different location-reporting workflow. Each has trade-offs, especially offline.

### 3.5 Node-to-gateway transport must be explicit

Choose and document one transport for the initial prototype:

- **Wi-Fi/IP:** suitable when a node can join a local IP network and reach the Pi API.
- **ESP-NOW:** useful for compact vendor-specific peer messages, but it is not a standard IP bridge. A gateway service must translate messages into application records.
- **LoRa:** suitable for small, low-bandwidth payloads over a suitable radio link; not for normal web traffic, large images, or general IP bridging without extra infrastructure.

Do not call an ESP32 chain a reliable internet mesh or Wi-Fi repeater unless that exact topology has been implemented and measured. Document range, obstacles, data rates, retry behavior, queue limits, and expected failure modes.

---

## 4. User roles and permissions

Implement role-based authorization on the backend. Hiding a button in the frontend is not an authorization check.

| Role | Typical permissions |
|---|---|
| Viewer | Read overview, maps, node state, and approved reports |
| Dispatcher | Review incidents, acknowledge, assign, update status, send approved messages |
| Field coordinator | Update assigned team/task status, submit field notes, view relevant resources |
| Node technician | Register nodes, inspect diagnostics, manage deployment references and modules |
| Administrator | Manage operators, configuration, backups, and all permitted operational functions |

A small demonstration may begin with administrator and operator roles, but keep the permission checks centralized so the model can grow.

### 4.1 Authentication requirements

- Local authentication must work without an external identity provider.
- Store password hashes using a modern password-hashing library; never store plaintext passwords.
- Use secure session cookies or another carefully designed token strategy.
- Apply session expiration and logout.
- Protect state-changing requests against CSRF when cookie-based authentication is used.
- Rate-limit login attempts and externally reachable submission endpoints.
- Require stronger confirmation for destructive or high-impact actions.
- Record operator ID, time, action, and affected record in the audit log.

### 4.2 Node identity is separate from operator identity

A node should not authenticate merely by claiming a `node_id` in JSON. Provision a per-node secret, key, or another authenticated identity mechanism suitable for the chosen transport. Keep node credentials separate from operator sessions. If a radio transport cannot provide adequate security by itself, add message authentication, replay protection, and sequence/timestamp validation at the application layer.

---

## 5. Navigation and route hierarchy

Use a persistent sidebar on desktop, a compact navigation drawer on smaller screens, and a top bar that always exposes connection state and operator identity.

Suggested routes:

```text
/login
/
/map
/incidents
/incidents/:incidentId
/survivors
/survivors/:survivorId
/nodes
/nodes/register
/nodes/:nodeId
/nodes/:nodeId/location
/nodes/:nodeId/modules
/nodes/:nodeId/events
/modules
/messages
/resources
/shelters
/reports
/audit
/settings
/settings/operators
/settings/network
/settings/alerts
```

You may consolidate or rename routes during implementation, but preserve clear separation between list views, details, and configuration.

### Global shell

- Product label and current mission/incident context, if configured.
- Gateway connection status, API status, and last successful synchronization time.
- User menu and logout.
- A visible stale-data banner when the client cannot verify current state.
- A compact alert indicator linking to unresolved high-priority incidents.
- A responsive left navigation.

Do not make color the sole way to communicate severity or state. Pair colors with text labels and/or icons.

---

## 6. Page-by-page functional specification

## 6.1 Overview

**Purpose:** Tell an operator what needs attention immediately.

### Components

1. **Network summary cards:** total nodes, online nodes, offline nodes, warning/fault nodes.
2. **Incident summary:** new SOS, unacknowledged SOS, incidents in progress, resolved incidents for a selected interval.
3. **Map preview:** recent reports and nodes, with a link to the full map.
4. **Priority queue:** incidents sorted by explicitly defined operational priority and age.
5. **Node health list:** last heartbeat, battery if available, last-known status, and warnings.
6. **Recent activity:** incident events, node connection events, module faults, and operator actions.
7. **Gateway health:** API/database status, storage capacity, last backup, and clock/synchronization health if available.

### Behavior

- Cards must be clickable where a useful filtered destination exists.
- Every live metric must expose its last-updated timestamp or have a clear page-level freshness state.
- If live data is not available, show “Last updated at …” and “Data may be stale”; never silently present old values as current.
- Avoid inventing an “AI recommendation” panel in the MVP. Add decision-support features only when their data, assumptions, and validation are defensible.

## 6.2 Situation Map

### Map layers

- Node deployment references.
- Current node positions from a GPS module, where available.
- Survivor-provided locations.
- SOS/incidents.
- Shelters, supply points, and known safe locations.
- Optional manually marked hazards or operational zones.

### Map behaviors

- Marker clusters for crowded areas.
- Filters for time range, status, severity, node capability, and location source.
- Marker selection opens a details drawer with a link to the full record.
- Show a timestamp and accuracy/confidence where supplied.
- Distinguish locked deployment position, GPS position, manual position, and approximate node-associated search area.
- Do not infer a survivor's precise position from node range or signal strength.
- Show an explicit state when offline tiles are missing at the current zoom/area.
- Provide list/table alternatives for operators who cannot use the map or for locations that are not geocoded.

### Offline map requirements

- Do not depend on public online tile servers during an offline incident.
- Preload an appropriate map area and zoom levels, or use a licensed offline package.
- Check map data licensing and attribution requirements.
- Document storage required for each package and how to replace/update it.
- Cache assets deliberately; browser caching alone is not a complete offline map strategy.

## 6.3 SOS and Incident Management

### Incident fields

- Unique incident ID.
- Incident/report category.
- Severity or priority and the rule used to set it.
- Status.
- Created, acknowledged, assigned, and resolved timestamps where applicable.
- Source type: survivor portal, operator, node, or import.
- Source node ID, if known.
- Reported coordinates, coordinate source, accuracy, and location timestamp.
- Text description and structured needs.
- Number of people affected, if reported.
- Assigned operator/team.
- Notes and attachments, if supported.
- Related/possible duplicate incident IDs.

### Suggested statuses

`NEW → ACKNOWLEDGED → ASSIGNED → IN_PROGRESS → RESOLVED`

Optional terminal outcomes may include `CANCELLED` or `DUPLICATE`. Validate allowed transitions on the backend. Do not let a client set an arbitrary status string.

### Incident UI

- Filter by status, severity, category, team, time, and location.
- Sort by priority, then age; document the rule.
- Show unacknowledged incidents prominently without hiding older incidents.
- Provide an incident detail view with history and assignment.
- Require confirmation for resolve/cancel actions where appropriate.
- Record each transition in an append-only event/history table.
- Handle duplicate submissions with an idempotency key or stable client-generated submission ID where possible.

### Critical delivery semantics

A backend `201 Created` response means the Pi API committed the record, not that a field team has seen it. A node-side queue means “queued on node.” A destination acknowledgement is a separate state. The UI must not conflate these states.

## 6.4 Survivor Registry

- Temporary survivor ID.
- Reported name/contact only if voluntarily supplied and operationally needed.
- First seen/last contact times.
- Location with source, accuracy and timestamp.
- Reported needs and related incidents.
- Rescue/follow-up status.
- Related duplicate records and merge history.

Use access controls and data minimization. A survivor report should not require a phone number or legal identity. Avoid showing sensitive contact data to roles that do not need it.

## 6.5 Node Management

### Node list columns

- Node ID and optional operator-friendly name.
- Online/offline/stale/fault state.
- Last heartbeat.
- Battery or supply voltage, if reported.
- Current link metrics, if supported.
- Current reported module summary.
- Deployment location.
- Firmware and protocol version.
- Last known connected-client count, if supported.

### Node details tabs

1. **Overview:** identity, firmware, health, uptime, link state, heartbeat.
2. **Location:** locked deployment location, current GPS location (if present), accuracy, distance from reference and history.
3. **Modules:** discovered capabilities and per-module health.
4. **Events:** boot/reconnect, warnings, sensor faults, movement alerts.
5. **Configuration:** only supported, validated settings for the node.

### Node lifecycle

Suggested lifecycle: `REGISTERED → DEPLOYED → MAINTENANCE → RETIRED`. Online/offline state is a separate runtime state, not a replacement for lifecycle status.

### Deployment reference coordinates

Store deployment coordinates separately from live coordinates. Locking a reference location should store who set it and when. Updating it should require explicit permission and generate an audit event. A displacement alert must account for GPS accuracy, repeated readings, and a configurable threshold; a single noisy reading should not automatically establish that the node has moved.

If no GPS module is present or no fresh fix is available, show the deployment reference and label current location as unavailable. Do not claim that the node has moved without evidence.

## 6.6 Module Management and capability discovery

The frontend should render only known, allowlisted module types and capabilities from a validated report.

### Module states

Use distinct states such as:

- `PRESENT_ONLINE`
- `PRESENT_DEGRADED`
- `PRESENT_OFFLINE`
- `NOT_DETECTED`
- `UNKNOWN` (report absent, stale, invalid, or incompatible)

Do not collapse “not detected” and “unknown.” A missing report is not proof that hardware is absent.

### Example capability descriptor

```json
{
  "protocol_version": "1.0",
  "node_id": "NODE-007",
  "firmware_version": "1.2.0",
  "hardware_revision": "A1",
  "reported_at": "2026-10-11T04:10:00Z",
  "modules": [
    {
      "module_id": "GPS-001",
      "type": "GPS",
      "status": "ONLINE",
      "capabilities": ["location", "speed", "utc_time"],
      "firmware_version": "1.0.2"
    },
    {
      "module_id": "CAM-001",
      "type": "CAMERA",
      "status": "ONLINE",
      "capabilities": ["photo_capture"],
      "firmware_version": "1.0.0"
    }
  ]
}
```

This is an illustrative contract. Choose field names and allowed values once, put the schema under version control, and validate descriptors at the API boundary. The Pi should use the schema version and allowlisted registry to decide what to render.

### Dynamic UI rules

- GPS module with a valid fix: render coordinates, last-fix time, and quality fields the firmware actually reports.
- GPS module without a valid fix: render “GPS detected — no current fix,” not coordinates from an old reading without a stale label.
- Camera module: show camera controls only if the module supports the relevant operation and the operator has permission.
- IMU module: show only the movement/orientation measurements actually implemented in the firmware.
- No optional module: show core node health and deployment reference location.
- Unknown capability or incompatible protocol: show a safe diagnostic message; never execute arbitrary module-provided code.

A physical expansion connector does not by itself create true plug-and-play discovery. Firmware, electrical interface, power limits, connector pinout, module IDs, and a discovery protocol must be designed and tested.

## 6.7 Communications and Messages

- Message ID, sender, recipient/group, type, creation time, body/payload reference, and delivery state.
- States should distinguish `CREATED`, `ACCEPTED_BY_GATEWAY`, `QUEUED_FOR_NODE`, `FORWARDED`, `ACKNOWLEDGED`, `FAILED`, and `EXPIRED` as applicable to the actual transport.
- Provide retries and expiry policy for supported messages.
- Limit payload size; route images through a deliberate attachment mechanism rather than blocking the emergency-message channel.
- Show failure reason and last attempt.
- Provide a clear indication when a broadcast was only accepted by the Pi, not acknowledged by receiving nodes.

## 6.8 Resources and Shelters

### Shelter fields

- Shelter ID/name, coordinates, capacity, occupancy estimate, status, last updated time, and responsible operator/source.

### Resource fields

- Resource ID/type, unit, available quantity, reserved quantity if used, location, last updated time, and update source.

### Actions

- Create/update shelter and stock records.
- Record inbound requests.
- Assign and fulfill requests.
- Flag low stock by configurable thresholds.
- Audit manual adjustments.

For the MVP, use explicit manual updates. Do not present estimated stock or occupancy as sensor-verified unless the relevant hardware has been implemented and validated.

## 6.9 Reports and Audit

Reports can include:

- Incident totals by category, status, priority and time range.
- Acknowledgement/assignment/resolution durations.
- Node uptime and missed-heartbeat summaries.
- Battery and module fault history.
- Message forwarding and acknowledgement outcomes.
- Resource request/fulfilment totals.
- Operator audit trail.

Allow CSV/JSON export for the first release. If a report contains personal or location data, require appropriate permissions and avoid exporting more detail than necessary. Clearly label data gaps caused by offline periods.

## 6.10 System Settings

- Operator management and role assignment.
- Node and capability protocol versions.
- Alert thresholds and heartbeat timeout.
- Gateway, database, and storage health.
- Backup and restore status.
- Offline map package inventory.
- Local time and UTC timestamp handling.
- Session policy and audit retention.
- Application build/version information.

Configuration values should have safe bounds, validation, and audit entries. Do not expose arbitrary shell-command execution from the web UI.

---

## 7. Backend API contract

All routes below are proposed. Implement and document request schemas, response schemas, permission rules, validation, pagination, and error codes before the frontend depends on them.

### 7.1 Conventions

- Prefix endpoints with `/api/v1` from the start to make future versioning explicit.
- Use JSON for ordinary API requests and responses.
- Use ISO 8601 timestamps in UTC, such as `2026-10-11T04:10:00Z`.
- Use stable string or UUID identifiers; do not depend on database row positions.
- Add pagination to list endpoints.
- Use query parameters for filtering and sorting.
- Return machine-readable error codes plus safe human-readable messages.
- Validate every input on the backend, even if the frontend validates it too.
- Use an idempotency key or client submission ID for retryable incident creation.

### 7.2 Proposed endpoints

| Method | Endpoint | Purpose / access |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Authenticate local operator |
| `POST` | `/api/v1/auth/logout` | End session |
| `GET` | `/api/v1/auth/me` | Current user and permitted roles |
| `GET` | `/api/v1/overview` | Authorized overview metrics |
| `GET` | `/api/v1/health` | API health; minimize public diagnostic detail |
| `GET` | `/api/v1/nodes` | Filterable node inventory |
| `POST` | `/api/v1/nodes` | Register a node; technician/admin |
| `GET` | `/api/v1/nodes/{node_id}` | Node details |
| `PATCH` | `/api/v1/nodes/{node_id}` | Update allowed metadata/lifecycle fields |
| `POST` | `/api/v1/nodes/{node_id}/deployment` | Set or change deployment reference |
| `GET` | `/api/v1/nodes/{node_id}/events` | Node event history |
| `GET` | `/api/v1/nodes/{node_id}/capabilities` | Latest validated capability report |
| `POST` | `/api/v1/nodes/{node_id}/capability-reports` | Submit authenticated node descriptor |
| `POST` | `/api/v1/nodes/{node_id}/heartbeats` | Submit heartbeat and health |
| `GET` | `/api/v1/incidents` | Filterable incident queue |
| `POST` | `/api/v1/incidents` | Create incident from an authorized source |
| `GET` | `/api/v1/incidents/{incident_id}` | Incident detail and history |
| `PATCH` | `/api/v1/incidents/{incident_id}` | Update allowed incident fields/status |
| `POST` | `/api/v1/incidents/{incident_id}/assignments` | Assign team/operator |
| `POST` | `/api/v1/incidents/{incident_id}/notes` | Add a timestamped note |
| `GET` | `/api/v1/survivors` | Filterable survivor reports |
| `GET` | `/api/v1/survivors/{survivor_id}` | Survivor report detail |
| `GET` | `/api/v1/messages` | Message history |
| `POST` | `/api/v1/messages` | Create a message/broadcast |
| `GET` | `/api/v1/resources` | Resource inventory |
| `POST` | `/api/v1/resources/requests` | Submit a resource request |
| `GET` | `/api/v1/shelters` | Shelter list/map records |
| `GET` | `/api/v1/reports/incidents` | Incident metrics and export inputs |
| `GET` | `/api/v1/audit-logs` | Restricted audit history |
| `WS` | `/api/v1/ws` | Authorized live event stream |

Avoid building all endpoints at once. Implement the routes required by the first end-to-end workflow, then expand.

### 7.3 Example SOS request

```json
{
  "client_submission_id": "phone-local-id-00042",
  "category": "RESCUE",
  "description": "Two people need assistance",
  "people_affected": 2,
  "location": {
    "latitude": 16.50,
    "longitude": 80.64,
    "source": "BROWSER_GNSS",
    "accuracy_m": 25,
    "captured_at": "2026-10-11T04:10:00Z"
  },
  "source_node_id": "NODE-007"
}
```

Illustrative only. In production, coordinate fields must be range-checked, location source must use an allowlist, timestamps must be validated, and untrusted callers must not be allowed to impersonate a node merely by setting `source_node_id`. Do not treat example coordinates as real incident data.

### 7.4 Example response

```json
{
  "incident_id": "SOS-1042",
  "status": "NEW",
  "created_at": "2026-10-11T04:10:01Z",
  "accepted_by_gateway": true
}
```

The API should acknowledge successful persistence only after the database transaction has succeeded. This response does not mean a team has received or acknowledged the incident.

### 7.5 Error handling

Use a consistent error envelope, for example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted location is invalid.",
    "request_id": "req-example"
  }
}
```

Expected cases include unauthenticated, forbidden, validation failure, not found, stale version/conflict, rate limit, duplicate submission, API unavailable, and storage failure. Do not reveal secrets or sensitive stack traces to the browser.

---

## 8. WebSocket event contract

Use WebSockets to make the operator interface responsive, but do not make the WebSocket stream the only way data can be recovered.

### 8.1 Envelope

```json
{
  "event_id": "evt-1042",
  "event_type": "incident.created",
  "occurred_at": "2026-10-11T04:10:01Z",
  "schema_version": "1.0",
  "entity_id": "SOS-1042",
  "data": {
    "status": "NEW",
    "source_node_id": "NODE-007"
  }
}
```

### 8.2 Event types to consider

- `incident.created`
- `incident.updated`
- `incident.assigned`
- `node.status_changed`
- `node.heartbeat_received`
- `node.capabilities_updated`
- `node.displacement_warning`
- `module.status_changed`
- `message.delivery_updated`
- `resource.requested`
- `resource.updated`
- `system.health_changed`

### 8.3 Reliability rules

- Publish events after the corresponding database transaction succeeds.
- Include unique event IDs and timestamps.
- Reconnect with bounded exponential backoff and jitter.
- On reconnect, fetch changes since a known cursor or refetch the relevant list/detail. WebSocket delivery alone should not be assumed durable.
- Deduplicate repeated event IDs on the client.
- If events arrive out of order, use timestamps/version fields and refetch the authoritative record when needed.
- Limit WebSocket subscriptions by role and permitted data scope.
- Use REST polling as a fallback for critical views if WebSockets are unavailable.

---

## 9. Database design

SQLite is a reasonable initial choice for a single Raspberry Pi prototype. Keep write transactions short and define backup and recovery procedures. SQLite is not a distributed shared database for every ESP32; the Pi hosts the authoritative database.

### 9.1 Suggested tables

| Table | Core fields (indicative) | Notes |
|---|---|---|
| `operators` | id, username, password_hash, role, active, created_at | Never store plaintext passwords |
| `nodes` | id, display_name, hardware_revision, firmware_version, protocol_version, lifecycle_state, deployment_lat, deployment_lon, deployment_locked_at, created_at | Locked reference location separate from live location |
| `node_heartbeats` | id, node_id, received_at, node_reported_at, battery, link_quality, uptime, health_state, connected_clients | Only fields the hardware actually reports |
| `node_locations` | id, node_id, latitude, longitude, accuracy_m, source, captured_at, received_at | Keep current/history separate from deployment reference |
| `capability_reports` | id, node_id, protocol_version, descriptor_json, valid, received_at, error_code | Preserve validated descriptor history as needed |
| `modules` | id, node_id, module_id, module_type, status, firmware_version, last_seen_at | Can be derived from latest report, but normalized records help history |
| `incidents` | id, client_submission_id, category, priority, status, description, people_affected, location fields, source, source_node_id, created_at, updated_at, assigned_to | Unique/idempotency constraint on stable client submission key where appropriate |
| `incident_events` | id, incident_id, event_type, old_value, new_value, actor_type, actor_id, created_at, note | Append-only incident history |
| `survivors` | id, temporary_reference, optional contact fields, first_seen_at, last_seen_at, status | Minimize personally identifying data |
| `messages` | id, source, destination, payload_reference, status, created_at, expires_at | Distinguish gateway acceptance from destination acknowledgement |
| `message_attempts` | id, message_id, attempted_at, outcome, error_code | Helps inspect intermittent links |
| `resources` | id, resource_type, unit, quantity, reserved_quantity, location, updated_at, updated_by | Use transactions to protect quantity updates |
| `shelters` | id, name, latitude, longitude, capacity, occupancy_estimate, status, updated_at | Clearly label estimates and source |
| `audit_logs` | id, actor_type, actor_id, action, entity_type, entity_id, timestamp, metadata | Restrict read access; avoid unnecessary sensitive payloads |
| `system_events` | id, event_type, severity, entity_type, entity_id, payload_json, occurred_at | General operational history |

These are design-level fields, not a final migration. Normalize or combine tables based on implementation needs and query patterns. Add foreign keys, indexes, checks, and unique constraints deliberately.

### 9.2 Database practices

- Use migrations so the schema can evolve safely.
- Enable foreign-key enforcement.
- Use transactions for incident transitions, assignments, and resource quantity changes.
- Index common filter fields: status, created time, node ID, and incident priority where appropriate.
- Store UTC timestamps consistently; format them to local time in the UI.
- Define retention rules for location history, messages, attachments, and audit records.
- Back up to a separate storage location when possible, not only to the same SD card.
- Test restoring a backup; creating backups without testing restoration is insufficient.
- Avoid large binary image blobs in SQLite for the initial design; store files with controlled paths/metadata and reference them from the database if images are implemented.

---

## 10. Frontend behavior and state management

### 10.1 State categories

Keep different kinds of state separate:

- **Server state:** nodes, incidents, survivors, resources, health data; fetched and invalidated through the API client.
- **Live event state:** connection status and event cursor; used to trigger updates/re-fetches.
- **UI state:** open modal, active tab, visible filters, table sorting.
- **Draft state:** unsaved form content; show when a draft has not been persisted.
- **Offline state:** last successful fetch time, stale flags, write capability, pending local client submissions where implemented.

Do not treat data copied into React state as the source of truth. The backend remains authoritative.

### 10.2 Shared reusable components

Implement reusable components for:

- `AppShell`, `Sidebar`, `TopBar`, `ConnectionBanner`
- `StatusBadge`, `SeverityLabel`, `FreshnessLabel`
- `DataTable`, `FilterBar`, `Pagination`
- `MapPanel`, `EntityDetailsDrawer`
- `AlertBanner`, `Toast`, `EmptyState`, `ErrorState`, `LoadingSkeleton`
- `ConfirmDialog`, `PermissionGate`
- `LocationField`, `TimestampDisplay`, `BatteryIndicator`

These components should accept typed data and not contain unrelated API/database logic.

### 10.3 Common page states

Every data page should design for all of these states:

1. Initial loading.
2. Successfully loaded with records.
3. Successfully loaded but empty.
4. Partial data with some unavailable fields.
5. Stale data due to lost connection.
6. API error with retry action.
7. Insufficient permissions.
8. Invalid or incompatible record.

A blank table should not be the only response to every failure.

### 10.4 Forms and destructive actions

- Validate inputs for usability before submitting, then validate again on the API.
- Disable duplicate submissions while a request is pending.
- Preserve a user-entered draft after a transient error where safe.
- Show whether the backend accepted a write, not merely whether the button was clicked.
- Ask for confirmation before changing locked deployment coordinates, retiring a node, merging survivor records, or resolving/cancelling important incidents.
- Show the reason for a failure in language an operator can act on.

---

## 11. Offline and degraded-mode requirements

Offline operation must have a precise meaning. The browser, Pi, and ESP32 nodes can lose connectivity independently.

### 11.1 Dashboard-to-Pi outage

- Show that the API is unreachable and mark displayed server data stale.
- Do not allow writes to appear successful while the API is unavailable.
- Reconnect automatically with backoff.
- Re-fetch authoritative records after reconnecting.
- Keep cached interface assets available if deliberately configured, but do not imply that cached records are current.

### 11.2 Node-to-Pi outage

- Nodes may queue a defined set of small messages locally.
- Each queued message needs an ID, creation time, retry/expiry rules, and an acknowledgement model.
- The node must have a documented storage limit and overflow policy.
- When the link returns, forward queued messages and handle duplicates idempotently.
- The dashboard should identify when a report was generated earlier but received later.

ESP32 RAM/flash is limited. Do not assume every node can hold a full database, full offline map package, or unlimited images. Store only the small amount of data the chosen use case requires.

### 11.3 Internet outage

The core local dashboard and API should not depend on public internet services. Bundle frontend assets locally, use local DNS or a documented local address, preload required maps, and avoid CDN-hosted scripts/fonts needed for core operation.

### 11.4 Clock problems

Offline devices may have incorrect clocks. Keep both device-reported and gateway-received timestamps where useful. Display uncertainty if clock synchronization has not occurred; do not silently assume every device clock is accurate.

---

## 12. Location, movement, and data confidence

Location is a safety-critical field and must not be displayed without context.

Each location should ideally include:

- Latitude and longitude.
- Source: browser GNSS, node GPS, manual entry, deployment reference, or approximate association.
- Capture timestamp and gateway receipt timestamp.
- Accuracy estimate, when available.
- Validity/fix state.

Rules:

1. Never call a deployment reference the current position unless the UI explicitly labels it as the reference position.
2. Never call a node's coordinates the survivor's exact coordinates.
3. A stale GPS reading must show its age.
4. A displacement alarm should incorporate reported GPS accuracy, multiple readings, and a threshold suitable for the hardware and environment.
5. An IMU may detect movement/tilt but does not provide absolute position on its own.
6. RSSI can be affected by walls, people, antenna orientation, interference, and multipath; do not present RSSI-based estimates as precise triangulation without experimental validation.
7. If no current position exists, preserve the SOS flow and clearly label location as unavailable or approximate.

---

## 13. Privacy and security requirements

ResQNet may handle sensitive information about people in distress. Design privacy and security from the start, not as a final polish step.

- Collect only fields needed for emergency response.
- Restrict survivor and precise-location views by role.
- Avoid putting sensitive data into ordinary application logs or error messages.
- Use authenticated sessions for operator pages and authorize all API actions server-side.
- Validate and limit every client/node payload size.
- Validate capability descriptors against a schema and an allowlist.
- Do not execute code, dynamic imports, or shell commands supplied by nodes.
- Authenticate node-to-gateway messages and consider replay protection.
- Use an expiry policy for queued messages that would become unsafe or irrelevant after a period.
- Audit sensitive reads/exports where operationally appropriate, plus all high-impact edits.
- Back up the database securely and control access to backup files.
- Keep dependency updates and firmware revisions traceable.
- Document how operators revoke a node credential if a device is lost or compromised.

For a prototype, use synthetic test data until access controls, device authentication, backups, and data handling have been exercised.

---

## 14. Performance and reliability targets

Set targets for the prototype and measure them on the actual hardware. The values below are suggested initial acceptance targets, not proven performance claims.

- Dashboard initial load on the local network: target under 3 seconds on the test device/network.
- Routine API reads with modest local data: target under 500 ms at the 95th percentile on the Pi test setup.
- Once the API commits an SOS, the connected dashboard should ordinarily show it within 2 seconds under the tested LAN/WebSocket conditions.
- Reconnect without a full page reload after a short WebSocket interruption.
- Paginate large incident/event lists; do not load unbounded history by default.
- Never make a camera/image transfer block the primary SOS API path.
- Keep operational errors visible but do not flood the operator with duplicate alerts.

Measurements must document Pi model, storage, network setup, number of simulated nodes, payload sizes, and test method. Revise targets if measurements show they are unrealistic.

---

## 15. Accessibility and responsive design

- Support keyboard navigation and visible focus states.
- Use text labels alongside colors and icons for statuses.
- Keep primary incident actions easy to find and large enough to operate under stress.
- Avoid color-only severity coding; use readable text such as “High” or “Unacknowledged.”
- Keep tables usable on laptop screens and provide a stacked/compact alternative on narrow displays.
- Provide clear confirmation for dangerous actions and an undo/correction path when practical.
- Use readable contrast, meaningful form labels, and appropriate ARIA labels where needed.
- Show timestamps in a consistent format and provide unambiguous date/time values in detail views.
- Avoid animation that distracts from incident priority; honor reduced-motion preferences.

The dashboard is optimized for operators, but it may be opened on a tablet or phone during field work. The survivor portal is a separate, simpler user experience.

---

## 16. Testing strategy

Testing must cover more than whether pages render.

### 16.1 Frontend tests

- Sidebar navigation and route protection.
- Empty, loading, error, stale, and partial-data states.
- Incident filters, sorting, pagination, and detail navigation.
- Role-based visibility for operator actions.
- Capability-driven module rendering from valid and invalid descriptors.
- WebSocket disconnect/reconnect and duplicate events.
- Form validation and duplicate-submit prevention.

### 16.2 Backend tests

- Authentication and role permissions.
- Schema validation for all request bodies.
- Incident lifecycle and valid/invalid status transitions.
- Database transaction rollback on failures.
- Idempotency for retried SOS submissions.
- Capability schema/version validation.
- Node identity and replay protection.
- Resource quantity consistency.
- Audit event creation for sensitive actions.

### 16.3 Integration tests

Test at minimum these flows:

1. A simulated survivor submission reaches FastAPI and is persisted.
2. The dashboard sees the incident via WebSocket or its fallback and can acknowledge it.
3. The dashboard correctly handles an API restart.
4. A node reports a GPS-only descriptor and only GPS features appear.
5. A node reports GPS plus camera and both supported feature sets appear.
6. A node with no optional modules still displays its locked deployment reference.
7. An invalid or unsupported descriptor is rejected or safely marked incompatible.
8. A stale GPS value is displayed as stale, not current.
9. Node movement alerts require sufficient valid evidence and create an audit/event record.
10. A node loses its gateway link, queues a test message, reconnects, forwards it, and duplicate forwarding does not create duplicate incidents.
11. The Pi reboots and the database records persist.
12. A backup can be restored successfully.

### 16.4 Field/network tests

- Test the chosen radio topology in realistic distances and obstructions.
- Measure delivery latency, packet loss, retries, queue growth, and battery consumption.
- Test when some nodes are offline but others remain reachable.
- Test browser geolocation behavior on the actual Android/iOS device and portal origin.
- Test offline map coverage, tile storage, and UI behavior outside the downloaded area.

Do not market the system as rescue-ready based only on UI or simulator tests. Real field deployment requires supervised hardware testing and an operational safety plan.

---

## 17. Acceptance criteria for the first usable release

The MVP is complete only when all relevant criteria below pass on the intended Raspberry Pi and node setup.

### Dashboard foundation
- [ ] Operator can sign in locally and log out.
- [ ] Navigation works and unauthorized routes/actions are restricted by the backend.
- [ ] API/gateway state and data freshness are visible.
- [ ] Critical pages show loading, empty, failure and stale-data states.

### Nodes and capabilities
- [ ] A node can be registered with a stable unique ID.
- [ ] Authenticated heartbeat reports update runtime state.
- [ ] The dashboard distinguishes online, stale, offline, and fault states.
- [ ] Deployment reference coordinates are stored separately from current location.
- [ ] The capability report is validated and versioned.
- [ ] GPS-only, GPS+camera, and no-optional-module cases are handled correctly.
- [ ] Unsupported or stale reports are shown as unknown/incompatible, not silently trusted.

### Incidents
- [ ] A survivor-side test submission is saved in the Pi database when the configured network path is available.
- [ ] Retrying a request does not create duplicate incidents when the same submission ID is used.
- [ ] The dashboard receives or fetches the new incident.
- [ ] An authorized operator can acknowledge, assign, update, and resolve the incident.
- [ ] All important status changes are recorded in incident history and the audit trail.
- [ ] UI distinguishes local queueing, gateway acceptance, forwarding, and destination acknowledgement.

### Offline/recovery
- [ ] Dashboard shows stale state when the API becomes unreachable.
- [ ] The client reconnects and refetches authoritative state after recovery.
- [ ] The node queue has a documented size limit, expiry policy, and duplicate-handling behavior.
- [ ] Essential frontend assets and configured map data work without public internet.
- [ ] Database backup and restoration are tested.

### Security and privacy
- [ ] No browser client accesses SQLite directly.
- [ ] All state-changing API endpoints enforce authorization.
- [ ] Node identity is authenticated by the selected design.
- [ ] Logs do not unnecessarily expose sensitive survivor data.
- [ ] The operator can revoke compromised node credentials.

---

## 18. Recommended development order

Build one functioning end-to-end slice before implementing every dashboard page.

### Phase 0 — Resolve critical architecture decisions

1. Select and document how ESP32 nodes communicate with the Pi.
2. Decide where the Survivor Portal is hosted and how its browser reaches the API.
3. Test browser geolocation on target phones and the chosen portal origin.
4. Define node identity and capability descriptor schemas.
5. Decide how local queued SOS reports are acknowledged and deduplicated.

**Do not skip this phase.** These choices affect the whole product and cannot be fixed by adding frontend code alone.

### Phase 1 — Local API and database

1. Set up the FastAPI app, SQLite database, migrations, and health endpoint.
2. Implement local operator login and authorization.
3. Add nodes and heartbeat records.
4. Add an incident-create endpoint with validation and idempotency.
5. Add basic audit records.

### Phase 2 — Dashboard shell

1. Create React + TypeScript + Vite app.
2. Build the responsive sidebar, top bar, connection banner, and routing.
3. Create a typed API client and common loading/error/empty components.
4. Build Overview, Node List, Node Details, and Incident Queue pages using real API responses.

### Phase 3 — First end-to-end SOS flow

1. Submit a test SOS through the Survivor Portal or a simple test client.
2. Persist the record on the Pi.
3. Publish a WebSocket event after successful persistence.
4. Display the incident in the dashboard.
5. Acknowledge and assign the incident from the dashboard.
6. Verify that both UI clients show the authoritative status after refetch/reconnect.

### Phase 4 — Capability-driven node UI

1. Implement descriptor schemas and validation.
2. Send reports from firmware or a simulator.
3. Create the module registry and safe dynamic rendering.
4. Add health states and stale descriptor behavior.
5. Implement locked deployment coordinates and conservative displacement detection.

### Phase 5 — Mapping and operations

1. Package offline maps for a small test area.
2. Add incident/node/shelter layers.
3. Add survivor registry, messages, resources, and reports as needed.
4. Add event history and practical operational filters.

### Phase 6 — Resilience and field validation

1. Test power interruption and Pi reboot.
2. Test loss and restoration of radio links.
3. Test storage-full and queue-overflow behavior.
4. Measure latency, data freshness, and radio range in the target environment.
5. Validate backup restoration, node credential revocation, and operator access controls.
6. Document limitations before demonstrating the system as a disaster-response tool.

---

## 19. Decisions that must be recorded before the build is considered stable

Track these in the project README or an architecture decision log.

| Decision | Why it matters | Required outcome |
|---|---|---|
| Node-to-Pi transport | Determines reach, throughput, payload size and gateway design | Chosen topology, protocol, retry strategy, and measured limits |
| Survivor Portal origin/hosting | Affects browser-to-API access and browser geolocation | Tested Android/iOS flow with documented limitations |
| Node authentication method | Prevents spoofed node reports | Provisioning, storage, rotation and revocation procedure |
| Capability protocol versioning | Allows firmware and dashboard to evolve safely | Versioned schema and compatibility policy |
| Offline message queue | Prevents loss/duplicates during intermittent links | Queue limits, expiry, acknowledgement and idempotency rules |
| GPS displacement rule | Prevents false movement alarms | Threshold, accuracy handling, confirmation readings, and alert cooldown |
| Offline map source/package | Determines coverage, storage, and licensing | Selected source, package process, attribution and update process |
| Data retention | Limits risk from sensitive survivor records | Retention periods, deletion/export permissions and backup policy |
| Backup target | Protects against SD card/Pi failure | Scheduled backup destination and tested restore procedure |
| Performance target | Gives a measurable acceptance standard | Test hardware, node count, workload, thresholds and results |

---

## 20. Practical first implementation checklist

Use this checklist in the order shown. Avoid starting with animations, complex charts, or decorative dashboard cards before the data path works.

- [ ] Create the repository and record the chosen hardware/network topology.
- [ ] Set up a repeatable development environment and dependency lockfiles.
- [ ] Create FastAPI `/api/v1/health` and SQLite migrations.
- [ ] Define typed API schemas and the node capability schema.
- [ ] Implement local login, roles, and audit events.
- [ ] Implement node registration and heartbeat updates.
- [ ] Implement incident creation, idempotency, state transitions, and history.
- [ ] Build the React app shell and API client.
- [ ] Build Node List, Node Details, and Incident Queue pages.
- [ ] Implement WebSocket updates and reconnect reconciliation.
- [ ] Connect a simulated node and a simulated survivor report before using real hardware.
- [ ] Connect one physical ESP32 using the selected transport.
- [ ] Test the portal on real phones, especially geolocation and local API access.
- [ ] Add offline map data and verify that no essential assets require public internet.
- [ ] Test outages, queue recovery, duplicate messages, backups, and permissions.
- [ ] Document exactly what has been tested and what remains unverified.

## Final recommendation

The first milestone should be deliberately small: **one authenticated operator, one registered ESP32 node, one working node-to-Pi path, one persisted SOS record, and one live dashboard update**. Once this works reliably under link loss and recovery, extend the same patterns to modules, mapping, messaging, resources, and reports.

ResQNet should display only what its hardware and software can actually verify. Clear distinctions between current and stale data, approximate and precise location, queued and delivered messages, and absent and unknown capabilities are core functional requirements—not optional UI polish.
