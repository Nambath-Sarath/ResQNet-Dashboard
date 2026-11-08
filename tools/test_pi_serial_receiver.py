#!/usr/bin/env python3
"""Regression tests for the ResQnet Pi serial bridge parser and spool."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pi_serial_receiver import DurableSpool, parse_gateway_line  # noqa: E402


class GatewaySerialParserTests(unittest.TestCase):
    def test_parses_current_readme_report_line(self) -> None:
        payload = (
            '{"k":"SOS","d":"Instant SOS","g":{"a":17.6868,"o":83.2185,'
            '"x":18,"t":1794141000000,"s":"BROWSER_GNSS"}}'
        )
        line = (
            "RESQNET_GATEWAY: REPORT_RECEIVED "
            "source=RQ-88F155071AD4 seq=123456 payload=" + payload
        )

        report = parse_gateway_line(line)

        self.assertIsNotNone(report)
        assert report is not None
        self.assertEqual(report["source_node_id"], "RQ-88F155071AD4")
        self.assertEqual(report["sequence"], 123456)
        self.assertEqual(report["payload"], payload)

    def test_parses_optional_last_hop_metadata(self) -> None:
        line = (
            "RESQNET_GATEWAY: REPORT_RECEIVED "
            "source=RQ-E08CFEE64AD8 seq=42 "
            "last_hop_node=RQ-88F155071AD4 last_hop_role=GATEWAY "
            "last_hop_mac=88:F1:55:07:1A:D5 payload=Instant SOS"
        )

        report = parse_gateway_line(line)

        self.assertIsNotNone(report)
        assert report is not None
        self.assertEqual(report["source_node_id"], "RQ-E08CFEE64AD8")
        self.assertEqual(report["sequence"], 42)
        self.assertEqual(report["payload"], "Instant SOS")

    def test_ignores_non_report_serial_lines(self) -> None:
        self.assertIsNone(parse_gateway_line("I (123) RESQNET_RADIO: route learned"))


class DurableSpoolTests(unittest.TestCase):
    def test_enqueue_is_idempotent_and_delivery_removes_from_pending(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            spool = DurableSpool(Path(temp_dir) / "spool.sqlite3")
            try:
                report = {
                    "source_node_id": "RQ-88F155071AD4",
                    "sequence": 123456,
                    "payload": '{"k":"SOS"}',
                }

                self.assertTrue(spool.enqueue(report))
                self.assertFalse(spool.enqueue(report))
                self.assertEqual(len(spool.pending()), 1)

                spool.mark_delivered(report["source_node_id"], report["sequence"])
                self.assertEqual(spool.pending(), [])
            finally:
                spool.close()


if __name__ == "__main__":
    unittest.main()
