"""Authenticated loopback cloud routes and cancellation/drive ownership."""

import io
import json
import unittest
from urllib.parse import urlsplit
from unittest.mock import Mock

from tools.companion_cloud_http import cloud_get, cloud_post
from tools.companion_cloud_destinations import available_updates


class CloudHttpTests(unittest.TestCase):
    def test_rich_filters_reach_registry_without_losing_exact_values(self):
        handler = Mock()
        cloud_get(
            handler,
            urlsplit(
                "/api/cloud/packages?q=sound%2B&category=Utilities&page=3&publisher=Publisher&max_size=10485760&sort=size"
            ),
        )
        handler.server.cloud.registry.return_value.packages.assert_called_once_with(
            "sound+",
            "Utilities",
            3,
            publisher="Publisher",
            max_size=10485760,
            sort="size",
        )
        with self.assertRaises(ValueError):
            cloud_get(handler, urlsplit("/api/cloud/packages?max_size=not-a-size"))

    def test_dispatches_reads_and_rejects_unknown_routes(self):
        handler = Mock()
        handler.server.cloud.registry.return_value.package.return_value = {
            "versions": []
        }
        handler.server.cloud.updates.return_value = {"updates": []}
        for route in (
            "packages?q=test&page=2",
            "package?id=example.app",
            "job",
            "updates",
            "missing",
        ):
            self.assertTrue(cloud_get(handler, urlsplit("/api/cloud/" + route)))
        self.assertFalse(cloud_get(handler, urlsplit("/api/state")))
        handler.server.cloud.registry.return_value.packages.assert_called_once_with(
            "test", "", 2, publisher="", max_size=None, sort="name"
        )

    def test_start_cancel_and_mutation_lock(self):
        handler = Mock()
        handler.server.cloud.snapshot.return_value = None
        self.assertFalse(cloud_post(handler, urlsplit("/api/select"), 0))
        handler.server.cloud.snapshot.return_value = {"status": "running"}
        with self.assertRaises(ValueError):
            cloud_post(handler, urlsplit("/api/select"), 0)
        data = json.dumps({"selection_id": "drive", "items": []}).encode()
        handler.rfile = io.BytesIO(data)
        self.assertTrue(cloud_post(handler, urlsplit("/api/cloud/start"), len(data)))
        handler.rfile = io.BytesIO(b"{}")
        self.assertTrue(cloud_post(handler, urlsplit("/api/cloud/cancel"), 2))
        handler.server.cloud.cancelled.set.assert_called_once()
        handler.server.cloud.snapshot.return_value = None
        handler.rfile = io.BytesIO(b'{"url":"https://registry.test"}')
        self.assertTrue(cloud_post(handler, urlsplit("/api/cloud/config"), 31))
        self.assertEqual(handler.server.cloud.client.base, "https://registry.test")
        self.assertTrue(cloud_get(handler, urlsplit("/api/cloud/config")))
        handler.server.cloud.snapshot.return_value = {"status": "running"}
        handler.rfile = io.BytesIO(b'{"url":"https://other.test"}')
        with self.assertRaises(ValueError):
            cloud_post(handler, urlsplit("/api/cloud/config"), 28)
        self.assertEqual(handler.server.cloud.client.base, "https://registry.test")
        handler.server.cloud.snapshot.return_value = None
        handler.rfile = io.BytesIO(b'{"url":12}')
        with self.assertRaises(ValueError):
            cloud_post(handler, urlsplit("/api/cloud/config"), 10)
        handler.rfile = io.BytesIO(b'{"url":""}')
        self.assertTrue(cloud_post(handler, urlsplit("/api/cloud/config"), 10))
        self.assertTrue(cloud_get(handler, urlsplit("/api/cloud/config")))
        with self.assertRaises(ValueError):
            cloud_post(handler, urlsplit("/api/cloud/start"), 0)
        handler.rfile = io.BytesIO(b"[]")
        with self.assertRaises(ValueError):
            cloud_post(handler, urlsplit("/api/cloud/start"), 2)

    def test_device_profile_advice_does_not_gate_version_details(self):
        handler = Mock()
        handler.server.cloud.registry.return_value.package.return_value = {
            "versions": [{"version": "1", "compatibility": {"vehicles": ["EV6"]}}]
        }
        cloud_get(
            handler, urlsplit("/api/cloud/package?id=example.app&vehicle=IONIQ+5")
        )
        result = handler.respond.call_args.args[1]
        self.assertEqual(result["versions"][0]["version"], "1")
        self.assertEqual(
            result["versions"][0]["compatibility_advice"][0]["state"], "mismatch"
        )

    def test_update_checks_keep_unknown_versions_manual_and_report_failures(self):
        client = Mock()
        client.package.side_effect = [
            {
                "versions": [
                    {"version": "2"},
                    {"version": "1"},
                    {"version": "release-red"},
                ]
            },
            ValueError("Offline"),
        ]
        packages = [
            {
                "id": "example.app",
                "kind": "install",
                "folder": "Example",
                "version": "1",
            },
            {"id": "other.app", "kind": "install", "folder": "Other", "version": "1"},
            {"id": "script", "kind": "execute"},
            {"error": "Broken"},
        ]
        result = available_updates(client, packages)["updates"]
        self.assertEqual(result[0]["versions"], [{"version": "2"}])
        self.assertEqual(result[1]["error"], "Offline")
