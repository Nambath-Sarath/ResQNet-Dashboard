// ResQNet seed script — creates realistic mock data for local development.
// Run: `bun run db:seed`

import { PrismaClient, IncidentCategory, IncidentPriority, IncidentStatus, MessageStatus } from '@prisma/client'
import { randomUUID } from 'crypto'

const db = new PrismaClient()

// Tiny plaintext-equivalent for the demo only. Real auth uses bcrypt in the API.
// Here we store a precomputed bcrypt hash for "resqnet123" for all demo operators.
// Generated with: bcrypt.hashSync('resqnet123', 10)
const DEMO_PASSWORD_HASH =
  '$2b$10$DHiXcyah5yvG1Quyo8mxu.OMbBSxLJTdYcy1hctgJzxsJ1W5IfhYS'

const now = Date.now()
const minutesAgo = (m: number) => new Date(now - m * 60_000)
const hoursAgo = (h: number) => new Date(now - h * 60 * 60_000)
const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60_000)

async function main() {
  console.log('🌱 Seeding ResQNet database...')

  // --- Operators -----------------------------------------------------------
  const operators = await Promise.all([
    db.operator.create({
      data: {
        username: 'admin',
        display_name: 'Avery Chen',
        password_hash: DEMO_PASSWORD_HASH,
        role: 'ADMINISTRATOR',
        active: true,
      },
    }),
    db.operator.create({
      data: {
        username: 'dispatcher',
        display_name: 'Priya Rao',
        password_hash: DEMO_PASSWORD_HASH,
        role: 'DISPATCHER',
        active: true,
      },
    }),
    db.operator.create({
      data: {
        username: 'tech',
        display_name: 'Marco Diaz',
        password_hash: DEMO_PASSWORD_HASH,
        role: 'NODE_TECHNICIAN',
        active: true,
      },
    }),
    db.operator.create({
      data: {
        username: 'field',
        display_name: 'Lena Okafor',
        password_hash: DEMO_PASSWORD_HASH,
        role: 'FIELD_COORDINATOR',
        active: true,
      },
    }),
    db.operator.create({
      data: {
        username: 'viewer',
        display_name: 'Sam Park',
        password_hash: DEMO_PASSWORD_HASH,
        role: 'VIEWER',
        active: true,
      },
    }),
  ])
  const [admin, dispatcher, tech, field] = operators
  console.log(`  ✓ ${operators.length} operators (password: resqnet123)`)

  // --- Nodes ---------------------------------------------------------------
  // Coordinates centered on a coastal city (illustrative: ~Visakhapatnam, IN)
  const baseLat = 17.6868
  const baseLon = 83.2185

  const nodeSpecs = [
    {
      id: 'NODE-001',
      display_name: 'Beachhead Alpha',
      lifecycle: 'DEPLOYED' as const,
      lat: baseLat + 0.012,
      lon: baseLon + 0.008,
      firmware: '1.4.2',
      protocol: '1.0',
      hw: 'A2',
      online: true,
      battery: 78,
      voltage: 3.91,
      link: 92,
      uptime: 184_300,
      clients: 14,
      rssi: -58,
      modules: [
        { type: 'GPS', status: 'PRESENT_ONLINE', caps: 'location,speed,utc_time', fw: '1.0.2' },
        { type: 'CAMERA', status: 'PRESENT_ONLINE', caps: 'photo_capture', fw: '1.0.0' },
        { type: 'IMU', status: 'PRESENT_DEGRADED', caps: 'motion,tilt', fw: '0.9.1' },
      ],
    },
    {
      id: 'NODE-002',
      display_name: 'Riverside Relay',
      lifecycle: 'DEPLOYED' as const,
      lat: baseLat - 0.018,
      lon: baseLon + 0.021,
      firmware: '1.4.2',
      protocol: '1.0',
      hw: 'A2',
      online: true,
      battery: 54,
      voltage: 3.72,
      link: 71,
      uptime: 92_400,
      clients: 8,
      rssi: -71,
      modules: [
        { type: 'GPS', status: 'PRESENT_ONLINE', caps: 'location,speed,utc_time', fw: '1.0.2' },
        { type: 'ENVIRONMENT', status: 'PRESENT_ONLINE', caps: 'temp,humidity,pressure', fw: '1.1.0' },
      ],
    },
    {
      id: 'NODE-003',
      display_name: 'Hilltop Watch',
      lifecycle: 'DEPLOYED' as const,
      lat: baseLat + 0.034,
      lon: baseLon - 0.011,
      firmware: '1.3.0',
      protocol: '1.0',
      hw: 'A1',
      online: false,
      battery: 12,
      voltage: 3.31,
      link: 0,
      uptime: 0,
      clients: 0,
      rssi: 0,
      modules: [
        { type: 'GPS', status: 'PRESENT_OFFLINE', caps: 'location,speed,utc_time', fw: '1.0.2' },
      ],
    },
    {
      id: 'NODE-004',
      display_name: 'Shelter Delta',
      lifecycle: 'DEPLOYED' as const,
      lat: baseLat - 0.006,
      lon: baseLon - 0.024,
      firmware: '1.4.2',
      protocol: '1.0',
      hw: 'A2',
      online: true,
      battery: 91,
      voltage: 4.08,
      link: 88,
      uptime: 254_900,
      clients: 22,
      rssi: -54,
      modules: [
        { type: 'GPS', status: 'PRESENT_ONLINE', caps: 'location,speed,utc_time', fw: '1.0.2' },
        { type: 'CAMERA', status: 'PRESENT_ONLINE', caps: 'photo_capture', fw: '1.0.0' },
        { type: 'ENVIRONMENT', status: 'PRESENT_ONLINE', caps: 'temp,humidity,pressure', fw: '1.1.0' },
        { type: 'IMU', status: 'PRESENT_ONLINE', caps: 'motion,tilt', fw: '0.9.1' },
      ],
    },
    {
      id: 'NODE-005',
      display_name: 'Pier Echo',
      lifecycle: 'MAINTENANCE' as const,
      lat: baseLat + 0.002,
      lon: baseLon + 0.033,
      firmware: '1.4.2',
      protocol: '1.0',
      hw: 'A2',
      online: false,
      battery: 0,
      voltage: 0,
      link: 0,
      uptime: 0,
      clients: 0,
      rssi: 0,
      modules: [
        { type: 'GPS', status: 'UNKNOWN', caps: '', fw: null },
      ],
    },
    {
      id: 'NODE-006',
      display_name: 'North Gate',
      lifecycle: 'DEPLOYED' as const,
      lat: baseLat + 0.045,
      lon: baseLon + 0.014,
      firmware: '1.4.2',
      protocol: '1.0',
      hw: 'A2',
      online: true,
      battery: 66,
      voltage: 3.82,
      link: 64,
      uptime: 76_800,
      clients: 5,
      rssi: -77,
      modules: [
        { type: 'GPS', status: 'PRESENT_DEGRADED', caps: 'location,utc_time', fw: '1.0.2' },
        { type: 'ENVIRONMENT', status: 'PRESENT_ONLINE', caps: 'temp,humidity', fw: '1.1.0' },
      ],
    },
  ]

  for (const spec of nodeSpecs) {
    await db.node.create({
      data: {
        id: spec.id,
        display_name: spec.display_name,
        hardware_revision: spec.hw,
        firmware_version: spec.firmware,
        protocol_version: spec.protocol,
        auth_secret: randomUUID(),
        lifecycle_state: spec.lifecycle,
        deployment_lat: spec.lat,
        deployment_lon: spec.lon,
        deployment_locked_by: tech.id,
        deployment_locked_at: daysAgo(3),
        deployment_accuracy_m: 8.0,
        modules: {
          create: spec.modules.map((m) => ({
            module_id: `${m.type}-${spec.id.split('-')[1]}`,
            module_type: m.type,
            status: m.status,
            capabilities: m.caps,
            firmware_version: m.fw,
            last_seen_at: spec.online ? minutesAgo(1) : hoursAgo(2),
          })),
        },
        heartbeats: {
          create: [
            {
              // received_at must reflect when gateway actually saw the heartbeat
              received_at: spec.online ? minutesAgo(1) : hoursAgo(2),
              node_reported_at: spec.online ? minutesAgo(1) : hoursAgo(2),
              battery: spec.battery,
              supply_voltage: spec.voltage,
              link_quality: spec.link,
              uptime_seconds: spec.uptime,
              health_state: !spec.online ? 'UNKNOWN' : spec.battery < 20 ? 'DEGRADED' : 'OK',
              connected_clients: spec.clients,
              rssi: spec.rssi,
            },
            {
              received_at: spec.online ? minutesAgo(6) : new Date(now - (2 * 60 + 1) * 60_000),
              node_reported_at: spec.online ? minutesAgo(6) : new Date(now - (2 * 60 + 1) * 60_000),
              battery: spec.battery,
              supply_voltage: spec.voltage,
              link_quality: spec.online ? Math.max(0, spec.link - 4) : 0,
              uptime_seconds: spec.online ? Math.max(0, spec.uptime - 300) : 0,
              health_state: !spec.online ? 'UNKNOWN' : spec.battery < 20 ? 'DEGRADED' : 'OK',
              connected_clients: spec.online ? Math.max(0, spec.clients - 2) : 0,
              rssi: spec.rssi,
            },
          ],
        },
        locations: {
          create: spec.online
            ? [
                {
                  latitude: spec.lat + 0.0002,
                  longitude: spec.lon - 0.0001,
                  accuracy_m: 6.0,
                  source: 'GPS_MODULE',
                  captured_at: minutesAgo(1),
                  valid: true,
                },
                {
                  latitude: spec.lat + 0.0001,
                  longitude: spec.lon,
                  accuracy_m: 7.5,
                  source: 'GPS_MODULE',
                  captured_at: minutesAgo(6),
                  valid: true,
                },
              ]
            : [],
        },
        node_events: {
          create: spec.online
            ? [
                {
                  event_type: 'reconnect',
                  severity: 'info',
                  payload: JSON.stringify({ link: spec.link }),
                  occurred_at: hoursAgo(2),
                },
                {
                  event_type: 'heartbeat',
                  severity: 'info',
                  payload: JSON.stringify({ battery: spec.battery }),
                  occurred_at: minutesAgo(1),
                },
              ]
            : [
                {
                  event_type: 'disconnect',
                  severity: 'critical',
                  payload: JSON.stringify({ reason: 'no_heartbeat' }),
                  occurred_at: hoursAgo(2),
                },
              ],
        },
        capability_reports: {
          create: [
            {
              protocol_version: spec.protocol,
              firmware_version: spec.firmware,
              hardware_revision: spec.hw,
              descriptor_json: JSON.stringify({
                protocol_version: spec.protocol,
                node_id: spec.id,
                firmware_version: spec.firmware,
                hardware_revision: spec.hw,
                reported_at: minutesAgo(1).toISOString(),
                modules: spec.modules.map((m) => ({
                  module_id: `${m.type}-${spec.id.split('-')[1]}`,
                  type: m.type,
                  status: m.status.replace('PRESENT_', ''),
                  capabilities: m.caps.split(',').filter(Boolean),
                  firmware_version: m.fw,
                })),
              }),
              valid: true,
              received_at: minutesAgo(1),
            },
          ],
        },
      },
    })
  }
  console.log(`  ✓ ${nodeSpecs.length} nodes (with heartbeats, locations, modules, events, capability reports)`)

  // --- Incidents -----------------------------------------------------------
  const incidentSpecs = [
    {
      id: 'SOS-1042',
      category: 'RESCUE',
      priority: 'CRITICAL',
      status: 'NEW',
      description: 'Two people trapped on the second floor of a flooded building near the riverside market.',
      people: 2,
      node: 'NODE-002',
      lat: baseLat - 0.016,
      lon: baseLon + 0.019,
      created: 8,
      ack: false,
    },
    {
      id: 'SOS-1041',
      category: 'MEDICAL',
      priority: 'HIGH',
      status: 'ACKNOWLEDGED',
      description: 'Elderly person needs insulin; supply chain interrupted.',
      people: 1,
      node: 'NODE-004',
      lat: baseLat - 0.005,
      lon: baseLon - 0.022,
      created: 34,
      ack: true,
      ackMins: 28,
    },
    {
      id: 'SOS-1040',
      category: 'RESCUE',
      priority: 'HIGH',
      status: 'ASSIGNED',
      description: 'Family of four stranded on a rooftop. Water rising.',
      people: 4,
      node: 'NODE-001',
      lat: baseLat + 0.013,
      lon: baseLon + 0.009,
      created: 72,
      ack: true,
      ackMins: 70,
      assignee: field.id,
      assignedMins: 60,
    },
    {
      id: 'SOS-1039',
      category: 'SUPPLY',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
      description: 'Shelter Delta reports low drinking water. Need 200L.',
      people: 22,
      node: 'NODE-004',
      lat: baseLat - 0.006,
      lon: baseLon - 0.024,
      created: 180,
      ack: true,
      ackMins: 178,
      assignee: field.id,
      assignedMins: 170,
    },
    {
      id: 'SOS-1038',
      category: 'FIRE',
      priority: 'CRITICAL',
      status: 'RESOLVED',
      description: 'Electrical fire at the pier warehouse. Extinguished by field team.',
      people: 0,
      node: 'NODE-005',
      lat: baseLat + 0.002,
      lon: baseLon + 0.033,
      created: 600,
      ack: true,
      ackMins: 598,
      assignee: field.id,
      assignedMins: 590,
      resolvedMins: 480,
    },
    {
      id: 'SOS-1037',
      category: 'STRUCTURE',
      priority: 'LOW',
      status: 'NEW',
      description: 'Partial roof collapse reported, no injuries. Inspection requested.',
      people: 0,
      node: 'NODE-006',
      lat: baseLat + 0.044,
      lon: baseLon + 0.013,
      created: 15,
      ack: false,
    },
    {
      id: 'SOS-1036',
      category: 'MEDICAL',
      priority: 'MEDIUM',
      status: 'ACKNOWLEDGED',
      description: 'Pregnant woman in early labor, needs transport to clinic.',
      people: 1,
      node: 'NODE-001',
      lat: baseLat + 0.011,
      lon: baseLon + 0.007,
      created: 47,
      ack: true,
      ackMins: 42,
    },
    {
      id: 'SOS-1035',
      category: 'COMMUNICATION',
      priority: 'LOW',
      status: 'RESOLVED',
      description: 'Survivor unable to reach family. Message relayed via gateway.',
      people: 1,
      node: 'NODE-002',
      lat: baseLat - 0.017,
      lon: baseLon + 0.020,
      created: 1440,
      ack: true,
      ackMins: 1438,
      assignee: dispatcher.id,
      assignedMins: 1430,
      resolvedMins: 1380,
    },
    {
      id: 'SOS-1034',
      category: 'RESCUE',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      description: 'Boat with 3 fishermen adrift near pier. Coast guard notified.',
      people: 3,
      node: 'NODE-005',
      lat: baseLat + 0.003,
      lon: baseLon + 0.035,
      created: 95,
      ack: true,
      ackMins: 90,
      assignee: field.id,
      assignedMins: 80,
    },
    {
      id: 'SOS-1033',
      category: 'FLOOD',
      priority: 'CRITICAL',
      status: 'NEW',
      description: 'Road washed out near north gate. Vehicles stranded.',
      people: 12,
      node: 'NODE-006',
      lat: baseLat + 0.046,
      lon: baseLon + 0.015,
      created: 4,
      ack: false,
    },
  ]

  for (const spec of incidentSpecs) {
    const created = minutesAgo(spec.created)
    const events: any[] = [
      {
        event_type: 'created',
        actor_type: 'survivor',
        new_value: spec.status,
        created_at: created,
        note: `Submitted via ${spec.node}`,
      },
    ]
    if (spec.ack) {
      events.push({
        event_type: 'acknowledged',
        actor_type: 'operator',
        actor_id: dispatcher.id,
        new_value: 'ACKNOWLEDGED',
        created_at: minutesAgo(spec.ackMins!),
      })
    }
    if (spec.assignee) {
      events.push({
        event_type: 'assigned',
        actor_type: 'operator',
        actor_id: dispatcher.id,
        new_value: spec.assignee,
        created_at: minutesAgo(spec.assignedMins!),
      })
    }
    if (spec.status === 'RESOLVED') {
      events.push({
        event_type: 'resolved',
        actor_type: 'operator',
        actor_id: spec.assignee || dispatcher.id,
        new_value: 'RESOLVED',
        created_at: minutesAgo(spec.resolvedMins!),
        note: 'Field team confirmed resolution.',
      })
    }
    if (['ASSIGNED', 'IN_PROGRESS', 'RESOLVED'].includes(spec.status)) {
      events.push({
        event_type: 'status_changed',
        actor_type: 'system',
        old_value: 'ASSIGNED',
        new_value: spec.status,
        created_at: minutesAgo(Math.max(1, spec.created - 2)),
      })
    }

    await db.incident.create({
      data: {
        id: spec.id,
        client_submission_id: `phone-${spec.id.toLowerCase()}`,
        category: spec.category as IncidentCategory,
        priority: spec.priority as IncidentPriority,
        status: spec.status as IncidentStatus,
        description: spec.description,
        people_affected: spec.people,
        source_type: 'survivor_portal',
        source_node_id: spec.node,
        location_lat: spec.lat,
        location_lon: spec.lon,
        location_source: 'BROWSER_GNSS',
        location_accuracy_m: 25,
        location_captured_at: created,
        created_at: created,
        acknowledged_at: spec.ack ? minutesAgo(spec.ackMins!) : null,
        assigned_at: spec.assignee ? minutesAgo(spec.assignedMins!) : null,
        resolved_at: spec.resolvedMins ? minutesAgo(spec.resolvedMins) : null,
        assigned_to_id: spec.assignee || null,
        events: { create: events },
        notes: spec.status === 'RESOLVED'
          ? {
              create: [
                {
                  body: 'Field team reports situation stabilized. No further action needed.',
                  author_id: spec.assignee || dispatcher.id,
                  created_at: minutesAgo(spec.resolvedMins!),
                },
              ],
            }
          : {},
      },
    })
  }
  console.log(`  ✓ ${incidentSpecs.length} incidents (with lifecycle events & notes)`)

  // --- Survivors -----------------------------------------------------------
  const survivorSpecs = [
    { ref: 'SRV-001', name: 'R. Kumar', status: 'rescued', lat: baseLat + 0.013, lon: baseLon + 0.009 },
    { ref: 'SRV-002', name: null, status: 'active', lat: baseLat - 0.016, lon: baseLon + 0.019 },
    { ref: 'SRV-003', name: 'M. Iyer', status: 'active', lat: baseLat - 0.005, lon: baseLon - 0.022 },
    { ref: 'SRV-004', name: null, status: 'missing', lat: baseLat + 0.044, lon: baseLon + 0.013 },
  ]
  for (const s of survivorSpecs) {
    await db.survivor.create({
      data: {
        temporary_ref: s.ref,
        display_name: s.name,
        first_seen_at: hoursAgo(20),
        last_seen_at: minutesAgo(15),
        status: s.status,
        location_lat: s.lat,
        location_lon: s.lon,
        location_source: 'BROWSER_GNSS',
      },
    })
  }
  console.log(`  ✓ ${survivorSpecs.length} survivors`)

  // --- Messages ------------------------------------------------------------
  const messageSpecs = [
    {
      source: dispatcher.id,
      destination: 'NODE-004',
      type: 'alert',
      body: 'Dispatching water resupply team. ETA 35 min.',
      status: 'ACKNOWLEDGED',
      ackMins: 12,
    },
    {
      source: 'system',
      destination: 'broadcast',
      type: 'broadcast',
      body: 'Shelter Delta is operational. Report injuries to nearest node.',
      status: 'FORWARDED',
      ackMins: 4,
    },
    {
      source: dispatcher.id,
      destination: 'NODE-005',
      type: 'text',
      body: 'Confirm camera module status.',
      status: 'QUEUED_FOR_NODE',
    },
    {
      source: 'system',
      destination: 'NODE-003',
      type: 'alert',
      body: 'Battery low. Return to base for charging.',
      status: 'FAILED',
      failure: 'node_offline',
    },
  ]
  for (const m of messageSpecs) {
    await db.message.create({
      data: {
        source: m.source,
        destination: m.destination,
        message_type: m.type,
        body: m.body,
        status: m.status as MessageStatus,
        created_at: minutesAgo(20),
        accepted_at: minutesAgo(19),
        forwarded_at: m.ackMins ? minutesAgo(m.ackMins + 2) : null,
        acknowledged_at: m.ackMins ? minutesAgo(m.ackMins) : null,
        failure_reason: m.failure || null,
        attempts: {
          create: [
            {
              attempted_at: minutesAgo(19),
              outcome: m.status === 'FAILED' ? 'failed' : 'success',
              error_code: m.failure || null,
            },
          ],
        },
      },
    })
  }
  console.log(`  ✓ ${messageSpecs.length} messages (with attempts)`)

  // --- Resources & shelters -----------------------------------------------
  await db.resource.createMany({
    data: [
      { resource_type: 'water', unit: 'litres', quantity: 1200, reserved_quantity: 200, location_label: 'Shelter Delta', location_lat: baseLat - 0.006, location_lon: baseLon - 0.024, updated_by_id: admin.id },
      { resource_type: 'food', unit: 'kits', quantity: 340, reserved_quantity: 60, location_label: 'Shelter Delta', location_lat: baseLat - 0.006, location_lon: baseLon - 0.024, updated_by_id: admin.id },
      { resource_type: 'medical_kit', unit: 'kits', quantity: 48, reserved_quantity: 12, location_label: 'Clinic North', location_lat: baseLat + 0.045, location_lon: baseLon + 0.014, updated_by_id: admin.id },
      { resource_type: 'blanket', unit: 'units', quantity: 220, reserved_quantity: 80, location_label: 'Shelter Delta', location_lat: baseLat - 0.006, location_lon: baseLon - 0.024, updated_by_id: admin.id },
      { resource_type: 'fuel', unit: 'litres', quantity: 60, reserved_quantity: 0, location_label: 'Depot', location_lat: baseLat + 0.001, location_lon: baseLon - 0.001, updated_by_id: admin.id },
    ],
  })
  console.log(`  ✓ 5 resource records`)

  await db.shelter.createMany({
    data: [
      { name: 'Shelter Delta', latitude: baseLat - 0.006, longitude: baseLon - 0.024, capacity: 200, occupancy_estimate: 168, status: 'OPEN', updated_by: admin.id },
      { name: 'North Gate Hall', latitude: baseLat + 0.045, longitude: baseLon + 0.014, capacity: 120, occupancy_estimate: 42, status: 'OPEN', updated_by: admin.id },
      { name: 'Pier Warehouse', latitude: baseLat + 0.002, longitude: baseLon + 0.033, capacity: 80, occupancy_estimate: 80, status: 'FULL', updated_by: admin.id },
    ],
  })
  console.log(`  ✓ 3 shelters`)

  // --- Audit logs ----------------------------------------------------------
  await db.auditLog.createMany({
    data: [
      { actor_type: 'operator', actor_id: admin.id, action: 'login', entity_type: 'operator', entity_id: admin.id, timestamp: hoursAgo(1), metadata: '{}' },
      { actor_type: 'operator', actor_id: dispatcher.id, action: 'incident.acknowledge', entity_type: 'incident', entity_id: 'SOS-1041', timestamp: minutesAgo(28), metadata: '{}' },
      { actor_type: 'operator', actor_id: dispatcher.id, action: 'incident.assign', entity_type: 'incident', entity_id: 'SOS-1040', timestamp: minutesAgo(60), metadata: JSON.stringify({ assignee: field.display_name }) },
      { actor_type: 'operator', actor_id: tech.id, action: 'node.deployment_lock', entity_type: 'node', entity_id: 'NODE-001', timestamp: daysAgo(3), metadata: '{}' },
      { actor_type: 'system', action: 'node.disconnect', entity_type: 'node', entity_id: 'NODE-003', timestamp: hoursAgo(2), metadata: '{}' },
    ],
  })
  console.log(`  ✓ 5 audit log entries`)

  await db.systemEvent.createMany({
    data: [
      { event_type: 'gateway.start', severity: 'info', occurred_at: hoursAgo(6) },
      { event_type: 'node.disconnect', severity: 'critical', entity_type: 'node', entity_id: 'NODE-003', occurred_at: hoursAgo(2) },
      { event_type: 'node.disconnect', severity: 'critical', entity_type: 'node', entity_id: 'NODE-005', occurred_at: hoursAgo(2) },
      { event_type: 'backup.success', severity: 'info', occurred_at: hoursAgo(4), payload: JSON.stringify({ destination: '/var/backups/resqnet' }) },
    ],
  })
  console.log(`  ✓ 4 system events`)

  console.log('\n✅ Seed complete. Login: admin / resqnet123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
