# Phone GPS and ESP32 gateway integration

This document connects the current ResQnet ESP-IDF four-board demo to the
ResQNet Command Dashboard. It describes the integration contract; it does not
claim that the portal handler already contains this code.

## 1. What this change adds

The dashboard branch adds:

- **POST /api/v1/nodes/{gatewayNodeId}/reports**: gateway-authenticated incident
  ingestion using the gateway's existing per-node X-Node-Secret.
- Idempotency using the originating ESP32 node ID and radio sequence number.
  A repeated serial line returns the existing incident instead of creating
  another SOS.
- Parsing for browser-phone coordinates carried inside the compact report.
  Phone location is written to the **incident** record, not the node's GPS
  history.
- A Pi serial reader at **tools/pi_serial_receiver.py**. It writes each report
  to a local SQLite spool before posting it to the dashboard, then retries
  undelivered records.
- **integrations/esp32/phone-gps.js**: a browser helper to request the phone's
  current location after a person explicitly taps a location button. It
  populates hidden form fields and never blocks the SOS submit action.

No Prisma migration is required. The existing Incident model already has
location_lat, location_lon, location_source, location_accuracy_m, and
location_captured_at; the existing Situation Map and Incident Detail views
already display incidents with location data.

## 2. Important browser constraint

The current ESP32 captive portal is served from http://192.168.4.1/. The
browser Geolocation API is restricted to secure contexts (normally HTTPS) and
requires user permission. The current HTTP portal therefore cannot be relied
on to read phone GPS. See the [MDN Geolocation API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API).

The helper detects an insecure context and displays an explanation. It does
not pretend to have coordinates, does not use the ESP32 node's location as a
survivor's location, and does not stop the SOS when location is unavailable.

For the current offline prototype, keep location optional and offer manual
coordinates as a fallback. A reliable automatic-GPS experience needs a
trusted HTTPS origin on the phone. A self-signed certificate is not enough
for ordinary browser trust and may also interfere with captive-portal
auto-opening. Do not make a public internet dependency part of the SOS path.

## 3. Add the helper to the ESP32 portal page

Copy **integrations/esp32/phone-gps.js** into the firmware's web assets or
embed its contents in the portal HTML. If the ESP32 HTTP server can serve
static assets, the page can load it as:

~~~html
<script src="/phone-gps.js"></script>
~~~

If the portal is a single embedded HTML string, include the script inline
instead. The uploaded firmware bundle in this development session did not
include the portal .c/.h files, so this repository contains the reusable
helper and integration contract rather than a guessed edit to the firmware
handler.

Add a location button and status region inside the existing report form:

~~~html
<form method="POST" action="/submit" data-resqnet-report-form>
  <!-- Keep the existing SOS / Medical / Safe & Waiting controls. -->

  <button type="button" data-resqnet-get-location>
    Attach my phone location
  </button>
  <p data-resqnet-location-status aria-live="polite">
    Location is optional. You can send an SOS without it.
  </p>

  <!-- Optional manual fallback. Omit this block if not needed in the UI. -->
  <label>
    Latitude
    <input type="number" step="any" data-resqnet-manual-lat
           inputmode="decimal" placeholder="e.g. 17.6868">
  </label>
  <label>
    Longitude
    <input type="number" step="any" data-resqnet-manual-lon
           inputmode="decimal" placeholder="e.g. 83.2185">
  </label>
</form>
<script src="/phone-gps.js"></script>
~~~

The helper creates these hidden fields automatically:

| Field | Meaning |
|---|---|
| location_lat | Latitude in decimal degrees |
| location_lon | Longitude in decimal degrees |
| location_accuracy_m | Reported phone accuracy in metres |
| location_captured_at | ISO 8601 capture timestamp |
| location_source | BROWSER_GNSS or MANUAL |

Only request location after a deliberate tap. Do not continually track the
person. A browser fix is attached to the next report submission. If the
browser blocks location, the form can still submit normally.

## 4. Firmware-side payload contract

The firmware /submit handler must read the optional location fields and
add them to the existing report JSON before calling the current persistent
report-queue API. Do not send phone coordinates in NodeHeartbeat or
NodeLocation; those represent the ESP32's own physical position.

The current firmware README caps the report body at 200 bytes. Use short keys
to keep this object compact. For a GPS-bearing SOS, the payload should be
equivalent to:

~~~json
{"k":"SOS","d":"Instant SOS","g":{"a":17.6868,"o":83.2185,"x":18,"t":1794141000000,"s":"BROWSER_GNSS"}}
~~~

Fields inside g:

| Key | Meaning |
|---|---|
| a | Phone latitude, decimal degrees |
| o | Phone longitude, decimal degrees |
| x | Accuracy, metres |
| t | Capture time as Unix milliseconds |
| s | Location source: BROWSER_GNSS or MANUAL |

The new dashboard API accepts this compact format. It also accepts the longer
location object with latitude, longitude, accuracy_m, captured_at, and source.
If no usable location is available, omit g entirely and queue the emergency
report as usual. Never send zero coordinates as a placeholder.

The firmware should validate both coordinates before adding g; latitude
must be between -90 and 90, longitude between -180 and 180, and accuracy must
be nonnegative. If g would take the report over the firmware's 200-byte
limit, preserve the emergency category/details and omit location rather than
truncating the SOS itself.

## 5. Register the gateway and obtain its secret

The new ingestion route authenticates against a registered dashboard Node.
Register the physical gateway using an Administrator or Node Technician
session. POST /api/v1/nodes creates the Node and returns its generated
auth_secret once. Save that value securely on the Raspberry Pi; do not put
the secret in browser JavaScript, the ESP32 phone portal, or Git.

Example request (replace the placeholders; the call requires the dashboard
operator's session cookie):

~~~bash
curl -X POST "http://127.0.0.1:81/api/v1/nodes" \
  -H "Content-Type: application/json" \
  -H "Cookie: resqnet_session=YOUR_OPERATOR_SESSION" \
  -d '{
    "id": "RQ-88F155071AD4",
    "display_name": "ResQnet USB Gateway",
    "hardware_revision": "ESP32",
    "firmware_version": "demo",
    "protocol_version": "1.0"
  }'
~~~

Record the returned auth_secret for the Pi bridge. Register each END_NODE in
the dashboard too if you want source_node_id to link directly to its Node
record. If an originating END_NODE is not registered, the ingestion endpoint
stores the gateway as the relational source node and preserves the reported
origin ID in the incident description/event note.

The current demo ESP-NOW transport does not authenticate or encrypt route
control/data frames. The gateway secret authenticates the Pi-to-dashboard
connection; it does **not** cryptographically prove the original source node
ID inside a relayed packet. Treat origin IDs as reported metadata until the
radio protocol is secured.

## 6. Install and run the Pi serial bridge

On the Raspberry Pi, from the dashboard repository root:

~~~bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-gateway.txt

export RESQNET_GATEWAY_NODE_ID="RQ-88F155071AD4"
export RESQNET_GATEWAY_SECRET="PASTE_THE_SECRET_FROM_NODE_REGISTRATION"
export RESQNET_DASHBOARD_URL="http://127.0.0.1:81"

python tools/pi_serial_receiver.py /dev/ttyUSB0
~~~

Change /dev/ttyUSB0 to the gateway's actual port. The default serial speed
is 115200 baud; override it with --baud if your firmware differs.

Run the bridge regression tests from the repository root with:

~~~bash
python tools/test_pi_serial_receiver.py
~~~

The bridge recognizes lines beginning:

**RESQNET_GATEWAY: REPORT_RECEIVED source=RQ-... seq=123456 payload=...**

For each line it:

1. Inserts (source_node_id, sequence, payload) into a local SQLite spool.
2. Posts the report to
   /api/v1/nodes/{gatewayNodeId}/reports with X-Node-Secret.
3. Marks the local spool row delivered only after a 2xx API response.
4. Retries pending spool records after the dashboard/API becomes reachable.

Keep the spool file (default **resqnet_gateway_spool.sqlite3**) on persistent
storage and include it in the Pi backup plan. Do not delete it to "reset" a
demo unless you have checked for undelivered records.

## 7. Verify the pipeline

1. Confirm the four ESP32 boards are running and the END_NODE portal is
   reachable at http://192.168.4.1/.
2. Start the Pi bridge before submitting a test SOS.
3. Submit an SOS with a browser GPS fix (on a trusted HTTPS test origin) or
   manual coordinates. Also test an SOS with no location.
4. Confirm the gateway emits RESQNET_GATEWAY: REPORT_RECEIVED.
5. Confirm the Pi bridge logs "stored in local spool", then
   "Dashboard accepted ... -> SOS-...".
6. Open the dashboard Situation Map. The incident should appear as an
   incident marker when coordinates were included.
7. Open the Incident Detail view and confirm source, accuracy, coordinates,
   and capture timestamp. A report without GPS should still appear in the
   incident queue but not as a located map marker.
8. Replay the same source-node/sequence record and verify the API returns
   duplicate: true without creating another incident.

## 8. Known delivery limitation that still needs firmware work

The current firmware README says the gateway prints the serial report, stores
its completion marker in NVS, and then floods the radio ACK. That means the
ESP32 may acknowledge and delete the upstream report even if the Pi is
disconnected or the serial reader was not running when the line was printed.

The Pi SQLite spool protects reports **after the Pi has received the serial
line**. It cannot recover a line that was never read. For stronger
store-and-forward semantics, the firmware should be changed to retain the
gateway queue item until the Pi explicitly acknowledges successful dashboard
API acceptance. The Pi bridge would then send a serial command such as
**bridge ack <source_node_id> <sequence>** only after the 2xx API response. Do
not claim end-to-end exactly-once delivery until that protocol is implemented
and power-loss tested.

Also test on the actual target phones. Browser location availability depends
on secure-context status, permission, device settings, and browser behavior.
