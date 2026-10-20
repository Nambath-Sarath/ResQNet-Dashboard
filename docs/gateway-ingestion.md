# ResQnet ESP-4 gateway ingestion

## Flow

The end-node captive portal submits the existing 12-field CSV format to `/report`. The ESP-NOW mesh carries that CSV to ESP-4. When configured, ESP-4 sends it over HTTPS to `POST /api/v1/gateway/reports` and keeps the record in its SPIFFS queue until the API returns a 2xx response. Only then does the gateway persist the completion marker and broadcast the end-to-end mesh ACK. HTTPS retries use a stable `(gateway_node_id, source_node_id, sequence)` idempotency key, so retrying a report should not create a second incident.

The endpoint requires `Authorization: Bearer <RESQNET_GATEWAY_TOKEN>`. Store the token as a server-only environment variable named `RESQNET_GATEWAY_TOKEN`; do not prefix it with `NEXT_PUBLIC_`, put it in browser code, or commit it to Git.

## Request format

`POST /api/v1/gateway/reports` accepts JSON:

```json
{
  "gateway_node_id": "RQ-88F155071AD4",
  "source_node_id": "RQ-78421C6CC474",
  "sequence": 123456789,
  "payload": "\"Medical Emergency\",\"Demo Name\",\"1\",\"Pregnancy emergency\",\"Critical\",\"\",\"\",\"\",\"false\",\"\",\"\",\"\"
}
```

`payload` is the original 12-field CSV line: report type, name, people, emergency, injury level, situation, supplies, details, location-available flag, latitude, longitude, and accuracy. Phone location is optional. Supported dashboard mappings are `Instant SOS` → `RESCUE/CRITICAL`, `Medical Emergency` → `MEDICAL` with priority derived from severity, and `Safe & Waiting` → `RESCUE/LOW`. The origin node is recorded as the incident source. Unknown origin nodes are registered with a random secret that this endpoint never returns.

Success is `201` for a new incident or `200` for an already accepted duplicate, with `accepted: true`. Authentication failures return `401`; invalid payloads return `400`; database failures are not acknowledged as successful. The endpoint also creates the normal `IncidentEvent` entry so the dashboard's incident queue and detail view can use the record.

## Sensor telemetry is accepted separately

The modular firmware also sends compact JSON telemetry through the same mesh queue, for example `{"kind":"telemetry","gps_seen":0,"fix":0,"lat_e6":null,"lon_e6":null,"imu":1,"moving":0,"ax_mg":12,"ay_mg":-5,"az_mg":1000,"gx_dps10":0,"gy_dps10":3,"gz_dps10":-2}`. The API recognizes that payload and idempotently upserts the source node's `GPS` and `IMU` rows in the existing `Module` table. It does not create an emergency incident for sensor samples or append a database row every five seconds. In this change the dashboard receives module presence/health state; raw accelerometer and gyroscope values are validated but are not shown as a live chart.

## Test endpoint before connecting the ESP32

In PowerShell, replace the host and token. Use a new sequence number for a new demo incident; reuse the same sequence to confirm duplicate suppression.

```powershell
$token = "PASTE_THE_SERVER_ONLY_TOKEN_HERE"
$body = @{
  gateway_node_id = "RQ-88F155071AD4"
  source_node_id  = "RQ-78421C6CC474"
  sequence        = 123456789
  payload         = '"Medical Emergency","ResQnet test","1","Pregnancy emergency","Critical","","","API smoke test","false","","",""'
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "https://YOUR-DEPLOYMENT-HOST/api/v1/gateway/reports" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $body
```

After a successful response, sign in to the dashboard and open the Incidents queue. The test incident should appear as a new `MEDICAL/CRITICAL` report. Send the same request again to verify that it returns `duplicate: true` instead of creating another row.

## Configure the ESP-4 gateway over its USB serial console

1. In the deployment's server-side environment variables, set `RESQNET_GATEWAY_TOKEN` to a strong random value. Generate one in PowerShell with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Redeploy/restart after adding the variable.
2. The Wi-Fi router must provide 2.4 GHz on channel 6. ESP-NOW and the gateway SoftAP share the same ESP32 radio; a different router channel will interfere with the mesh.
3. Open ESP-IDF Monitor for ESP-4. Enter these commands, replacing values with your real router SSID/password, deployed URL, and the same server token:

```text
cloud ssid YourRouterSSID
cloud password YourRouterPassword
cloud endpoint https://YOUR-DEPLOYMENT-HOST/api/v1/gateway/reports
cloud token PASTE_THE_SAME_TOKEN_HERE
cloud status
cloud restart
```

The token and Wi-Fi password are stored in NVS and never printed by the firmware. `cloud status` reports whether the four values are present, not their contents. Do not use `erase-flash`; it would erase node identity, roles, and stored settings/reports. To disable the uplink, run `cloud clear`.

4. After reboot, look for `RESQNET_CLOUD: Internet uplink connected` and `Dashboard uplink enabled` in ESP-4's monitor. If the router connection fails, check the SSID/password and channel 6 requirement. If a report is waiting in the queue, a successful post prints `Dashboard accepted report`, followed by `RESQNET_GATEWAY: REPORT_UPLOADED ... acknowledged_to_mesh=1`. Only then should the end-node portal show `Your request has been submitted.`
5. Submit a test report from the end-node phone portal. Confirm it appears in the browser dashboard's Incidents queue. Re-submit only for a separate test or use a different sequence in the API smoke test above.

## Deployment database requirement

The repository currently declares `provider = "sqlite"` and the development script points to `db/custom.db`. That works for the local/demo environment but a local SQLite file is not reliable persistent storage for Vercel Functions. Before treating a Vercel deployment as a real receiver, configure a persistent hosted database and update the Prisma deployment setup for it. Do not interpret a database error as a successful upload: the firmware intentionally keeps its flash queue and does not ACK the mesh until the endpoint returns 2xx.
