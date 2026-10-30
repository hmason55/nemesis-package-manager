"""Exercise the trusted ingestion runner with simulated GitHub and Worker IO."""

import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools import registry_validate
from test_registry import installer


class ValidationRunnerTests(unittest.TestCase):
    def test_ingests_exact_public_asset_and_never_sends_download_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            raw = installer(Path(directory) / "release.zip").read_bytes()
        job = {
            "repository": "owner/repo",
            "release_id": 10,
            "asset_id": 20,
            "package_id": "example.app",
            "version": "1.2",
        }
        asset = {
            "id": 20,
            "name": "package.zip",
            "size": len(raw),
            "browser_download_url": "https://github.com/owner/repo/releases/download/v1.2/package.zip",
        }
        completed = []

        def opened(request, **_):
            address = request if isinstance(request, str) else request.full_url
            if address.endswith("/claim"):
                return io.BytesIO(json.dumps(job).encode())
            if address.startswith("https://api.github.com/"):
                return io.BytesIO(
                    json.dumps({"draft": False, "assets": [asset]}).encode()
                )
            if address == asset["browser_download_url"]:
                self.assertIsInstance(request, str)
                return io.BytesIO(raw)
            if address.endswith("/artifact"):
                self.assertEqual(request.get_method(), "PUT")
                self.assertEqual(request.data.read(), raw)
                return io.BytesIO(b"{}")
            if address.endswith("/complete"):
                completed.append(json.loads(request.data))
                return io.BytesIO(b"{}")
            self.fail(address)

        with (
            patch.dict(os.environ, {"GITHUB_TOKEN": "github-test"}),
            patch.object(registry_validate, "urlopen", side_effect=opened),
        ):
            registry_validate.validate_job(
                "https://registry.test", "validator", "a" * 64
            )
        self.assertEqual(completed[0]["package_id"], "example.app")

    def test_failed_validation_never_uploads_and_records_safe_error(self):
        job = {
            "repository": "owner/repo",
            "release_id": 10,
            "asset_id": 20,
            "package_id": "example.app",
            "version": "1.2",
        }
        calls = []

        def requested(url, token, data):
            calls.append((url, data))
            return job if url.endswith("/claim") else {}

        with (
            patch.object(registry_validate, "request_json", side_effect=requested),
            patch.object(
                registry_validate,
                "release_asset",
                side_effect=ValueError("secret signed URL"),
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "Package validation failed"):
                registry_validate.validate_job(
                    "https://registry.test", "validator", "a" * 64
                )
        self.assertTrue(calls[-1][0].endswith("/fail"))
        self.assertNotIn("secret signed URL", calls[-1][1]["reason"])
        for base, job_id in (
            ("http://registry.test", "a" * 64),
            ("https://registry.test", "bad"),
        ):
            with self.assertRaises(ValueError):
                registry_validate.validate_job(base, "validator", job_id)

    def test_rejects_drafts_missing_assets_and_external_asset_urls(self):
        job = {"repository": "owner/repo", "release_id": 10, "asset_id": 20}
        asset = {
            "id": 20,
            "name": "package.zip",
            "size": 1,
            "browser_download_url": "https://evil.test/package.zip",
        }
        for release in (
            {"draft": True, "assets": [asset]},
            {"draft": False, "assets": [asset]},
            {"draft": False, "assets": []},
        ):
            with patch.object(
                registry_validate,
                "urlopen",
                return_value=io.BytesIO(json.dumps(release).encode()),
            ):
                with self.assertRaises((ValueError, StopIteration)):
                    registry_validate.release_asset(job)
        with self.assertRaises(ValueError):
            registry_validate.release_asset({**job, "repository": "../bad"})

    def test_download_limit_and_cli_configuration(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(registry_validate, "MAX_DOWNLOAD", 2),
            patch.object(registry_validate, "urlopen", return_value=io.BytesIO(b"123")),
        ):
            with self.assertRaises(ValueError):
                registry_validate.download_asset(
                    {
                        "browser_download_url": "https://github.com/owner/repo/releases/download/1/a.zip"
                    },
                    Path(directory) / "archive.zip",
                )
        with (
            patch.dict(
                os.environ,
                {
                    "REGISTRY_API_URL": "https://registry.test",
                    "REGISTRY_VALIDATOR_TOKEN": "token",
                },
            ),
            patch("sys.argv", ["validator", "a" * 64]),
            patch.object(registry_validate, "validate_job") as validate,
        ):
            registry_validate.main()
            validate.assert_called_once_with("https://registry.test", "token", "a" * 64)
