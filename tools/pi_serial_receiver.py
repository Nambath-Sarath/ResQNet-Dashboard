#!/usr/bin/env python3
"""Read ResQnet gateway reports from USB serial and forward them to the dashboard.

The SQLite spool is committed before each HTTP request. If the dashboard is
temporarily offline, pending reports are retried after reconnecting. The
dashboard's source-node + sequence idempotency key makes retries safe.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import signal
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

try:
    import serial
    from serial import SerialException
except ImportError:
    print(
        "Missing pyserial. Install it with: python3 -m pip install pyserial",
        file=sys.stderr,
    )
    raise SystemExit(2)


LOG = logging.getLogger("resqnet-gateway")
REPORT_RE = re.compile(
    r"^RESQNET_GATEWAY: REPORT_RECEIVED\s+"
    r"source=(?P<source>RQ-[A-Za-z0-9-]+)\s+"
    r"seq=(?P<sequence>\d+)\s+"
    r"(?:(?:last_hop_node=\S+)\s+)?"
    r"(?:(?:last_hop_role=\S+)\s+)?"
    r"(?:(?:last_hop_mac=\S+)\s+)?"
    r"payload=(?P<payload>.*)$"
)


def parse_gateway_line(line: str) -> dict[str, Any] | None:
    """Parse the current firmware's REPORT_RECEIVED serial line."""
    match = REPORT_RE.match(line.strip())
    if not match:
        return None

    payload = match.group("payload").strip()
    # Keep the payload as text. The dashboard accepts either a JSON object or
    # a JSON-encoded object, and also tolerates plain text emergency reports.
    return {
        "source_node_id": match.group("source"),
        "sequence": int(match.group("sequence")),
        "payload": payload,
    }


class DurableSpool:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, timeout=10)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                source_node_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                payload TEXT NOT NULL,
                captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                delivered_at TEXT,
                last_error TEXT,
                PRIMARY KEY (source_node_id, sequence)
            )
            """
        )
        self.db.commit()

    def enqueue(self, report: dict[str, Any]) -> bool:
        cursor = self.db.execute(
            """
            INSERT OR IGNORE INTO reports (source_node_id, sequence, payload)
            VALUES (?, ?, ?)
            """,
            (
                report["source_node_id"],
                report["sequence"],
                report["payload"],
            ),
        )
        self.db.commit()
        return cursor.rowcount == 1

    def pending(self, limit: int = 50) -> list[sqlite3.Row]:
        return list(
            self.db.execute(
                """
                SELECT source_node_id, sequence, payload
                FROM reports
                WHERE delivered_at IS NULL
                ORDER BY captured_at ASC
                LIMIT ?
                """,
                (limit,),
            )
        )

    def mark_delivered(self, source_node_id: str, sequence: int) -> None:
        self.db.execute(
            """
            UPDATE reports
            SET delivered_at = CURRENT_TIMESTAMP, last_error = NULL
            WHERE source_node_id = ? AND sequence = ?
            """,
            (source_node_id, sequence),
        )
        self.db.commit()

    def mark_error(self, source_node_id: str, sequence: int, error: str) -> None:
        self.db.execute(
            """
            UPDATE reports SET last_error = ?
            WHERE source_node_id = ? AND sequence = ?
            """,
            (error[:500], source_node_id, sequence),
        )
        self.db.commit()

    def close(self) -> None:
        self.db.close()


class DashboardClient:
    def __init__(self, base_url: str, gateway_id: str, secret: str, timeout: float) -> None:
        self.endpoint = (
            base_url.rstrip("/")
            + "/api/v1/nodes/"
            + urllib.parse.quote(gateway_id, safe="")
            + "/reports"
        )
        self.secret = secret
        self.timeout = timeout

    def post(self, report: dict[str, Any]) -> tuple[bool, str]:
        body = json.dumps(report, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            self.endpoint,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Node-Secret": self.secret,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                response_body = response.read().decode("utf-8", errors="replace")
                if 200 <= response.status < 300:
                    return True, response_body
                return False, f"HTTP {response.status}: {response_body}"
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            return False, f"HTTP {error.code}: {detail}"
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            return False, str(error)


def deliver_pending(spool: DurableSpool, client: DashboardClient) -> int:
    delivered = 0
    for row in spool.pending():
        report = {
            "source_node_id": row["source_node_id"],
            "sequence": row["sequence"],
            "payload": row["payload"],
        }
        ok, detail = client.post(report)
        if ok:
            spool.mark_delivered(report["source_node_id"], report["sequence"])
            delivered += 1
            try:
                response = json.loads(detail)
                incident_id = response.get("incident_id", "accepted")
                duplicate = response.get("duplicate", False)
                LOG.info(
                    "Dashboard accepted %s seq=%s -> %s%s",
                    report["source_node_id"],
                    report["sequence"],
                    incident_id,
                    " (duplicate retry)" if duplicate else "",
                )
            except (ValueError, AttributeError):
                LOG.info("Dashboard accepted %s seq=%s", report["source_node_id"], report["sequence"])
        else:
            spool.mark_error(report["source_node_id"], report["sequence"], detail)
            LOG.warning(
                "Dashboard delivery pending for %s seq=%s: %s",
                report["source_node_id"],
                report["sequence"],
                detail,
            )
            # Preserve order. A failed network/API request must not cause a
            # tight loop over later records or discard the failed report.
            break
    return delivered


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("serial_port", help="Gateway serial port, e.g. /dev/ttyUSB0 or COM5")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--dashboard", default=os.getenv("RESQNET_DASHBOARD_URL", "http://127.0.0.1:81"))
    parser.add_argument("--gateway-id", default=os.getenv("RESQNET_GATEWAY_NODE_ID", ""))
    parser.add_argument("--secret", default=os.getenv("RESQNET_GATEWAY_SECRET", ""))
    parser.add_argument(
        "--spool",
        default=os.getenv("RESQNET_SPOOL_DB", "./resqnet_gateway_spool.sqlite3"),
        help="Durable SQLite spool path",
    )
    parser.add_argument("--timeout", type=float, default=5.0)
    args = parser.parse_args()

    if not args.gateway_id or not args.secret:
        parser.error(
            "Set RESQNET_GATEWAY_NODE_ID and RESQNET_GATEWAY_SECRET before starting."
        )

    spool = DurableSpool(Path(args.spool).expanduser())
    client = DashboardClient(args.dashboard, args.gateway_id, args.secret, args.timeout)
    stop = False

    def request_stop(_signum: int, _frame: Any) -> None:
        nonlocal stop
        stop = True

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)

    LOG.info("ResQnet Pi gateway bridge starting")
    LOG.info("Serial: %s @ %d baud", args.serial_port, args.baud)
    LOG.info("Dashboard endpoint: %s", client.endpoint)
    LOG.info("Durable spool: %s", Path(args.spool).expanduser().resolve())

    serial_port = None
    try:
        while not stop:
            # Flush any reports persisted before a previous process exit.
            deliver_pending(spool, client)

            try:
                if serial_port is None or not serial_port.is_open:
                    LOG.info("Opening gateway serial port %s", args.serial_port)
                    serial_port = serial.Serial(
                        args.serial_port,
                        args.baud,
                        timeout=1,
                        write_timeout=2,
                    )

                raw_line = serial_port.readline()
                if not raw_line:
                    continue
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue

                report = parse_gateway_line(line)
                if report is None:
                    # Ignore routine ESP-IDF log lines; show other gateway
                    # serial messages only at DEBUG to keep the console useful.
                    LOG.debug("serial: %s", line)
                    continue

                inserted = spool.enqueue(report)
                LOG.info(
                    "%s report %s seq=%s stored in local spool",
                    "New" if inserted else "Repeated",
                    report["source_node_id"],
                    report["sequence"],
                )
                deliver_pending(spool, client)

            except (SerialException, OSError) as error:
                LOG.error("Serial connection error: %s", error)
                if serial_port is not None:
                    try:
                        serial_port.close()
                    except Exception:
                        pass
                    serial_port = None
                time.sleep(2)
    finally:
        if serial_port is not None:
            try:
                serial_port.close()
            except Exception:
                pass
        spool.close()
        LOG.info("Gateway bridge stopped")

    return 0


if __name__ == "__main__":
    logging.basicConfig(
        level=os.getenv("RESQNET_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    raise SystemExit(main())
