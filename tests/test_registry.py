"""Cloud integrity, cross-client versions, and USB preparation regression tests."""

import hashlib
import io
import json
import tempfile
import threading
import unittest
import zipfile
from pathlib import Path
from unittest.mock import Mock

from tools.companion_cloud import CloudJobs
from tools.companion_cloud_destinations import destination
from tools.companion_packages import add_package
from tools.registry_artifact import validate_artifact
from tools.registry_client import RegistryClient, NoRedirect
from tools.registry_versions import compare_versions


def installer(path, version="1.2", extra=None):
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(
            "NEMESIS.data",
            f"[nemesis]\nid=example.app\nname=Example\nversion={version}\n",
        )
        archive.writestr("install.sh", "echo not executed")
        if extra:
            archive.writestr(extra, "unsafe")
    return path


class RegistryTests(unittest.TestCase):
    def test_url_components_match_shared_registry_and_vehicle_fixtures(self):
        fixtures = json.loads(
            (
                Path(__file__).parents[1] / "contracts/fixtures/url-components.json"
            ).read_text(encoding="utf-8")
        )
        client = RegistryClient("https://registry.test")
        for fixture in fixtures:
            with self.subTest(version=fixture["value"]):
                value = {
                    "package_id": "example.app",
                    "version": fixture["value"],
                    "sha256": "a" * 64,
                    "size": 1,
                    "download_url": client.base
                    + "/v1/packages/example.app/versions/"
                    + fixture["encoded"]
                    + "/download",
                }
                client.json = lambda path: value
                self.assertEqual(client.version("example.app", fixture["value"]), value)

    def test_new_usb_folders_support_every_accepted_id_shape(self):
        for package_id in ("_example", "-example", "_" + "a" * 63, "CON", "example."):
            with (
                self.subTest(package_id=package_id),
                tempfile.TemporaryDirectory() as directory,
            ):
                root = Path(directory)
                archive = root / "package.zip"
                with zipfile.ZipFile(archive, "w") as package:
                    package.writestr(
                        "NEMESIS.data", f"[nemesis]\nid={package_id}\nversion=1\n"
                    )
                    package.writestr("README.txt", "Text-only fixture")
                folder, overwrite = destination(root, {"package_id": package_id})
                self.assertLessEqual(len(folder), 64)
                add_package(root, archive, folder, overwrite=overwrite)
                self.assertTrue((root / "packages" / folder).is_dir())

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.archive = installer(self.root / "release.zip")

    def test_versions_match_shared_vehicle_fixtures(self):
        fixtures = (
            Path(__file__).parent.parent / "contracts/fixtures/version-comparison.json"
        )
        for case in json.loads(fixtures.read_text()):
            with self.subTest(case=case):
                self.assertEqual(
                    compare_versions(case["candidate"], case["installed"]),
                    case["result"],
                )

    def test_exact_artifact_integrity_and_manifest_identity(self):
        result = validate_artifact(self.archive, "example.app", "1.2")
        self.assertEqual(
            result["sha256"], hashlib.sha256(self.archive.read_bytes()).hexdigest()
        )
        for values in (
            ("other.app", "1.2", None, None),
            ("example.app", "2", None, None),
            ("example.app", "1.2", 1, None),
            ("example.app", "1.2", None, "0" * 64),
        ):
            with self.assertRaises(ValueError):
                validate_artifact(self.archive, *values)

    def test_rejects_unsafe_zip_and_wrapper(self):
        installer(self.archive, extra="../outside")
        with self.assertRaises(ValueError):
            validate_artifact(self.archive, "example.app", "1.2")
        with zipfile.ZipFile(self.archive, "w") as archive:
            archive.writestr("NEMESIS.data", "[nemesis]\ntype=execute\npath=run.sh\n")
        with self.assertRaises(ValueError):
            validate_artifact(self.archive, "example.app", "1.2")

    def test_requires_https_and_refuses_download_redirects(self):
        for base in (
            "http://example.test",
            "https://user:pass@example.test",
            "https://example.test?q=1",
        ):
            with self.assertRaises(ValueError):
                RegistryClient(base)
        with self.assertRaises(ValueError):
            NoRedirect().redirect_request(
                None, None, 302, "redirect", {}, "https://other.test"
            )

    def client(self, cancelled=False, bad_hash=False, withdrawn=False):
        raw = self.archive.read_bytes()
        base = "https://registry.test"
        metadata = {
            "package_id": "example.app",
            "version": "1.2",
            "size": len(raw),
            "sha256": "0" * 64 if bad_hash else hashlib.sha256(raw).hexdigest(),
            "download_url": base + "/v1/packages/example.app/versions/1.2/download",
        }
        opener = Mock()
        opener.open.return_value = io.BytesIO(raw)
        client = RegistryClient(base, opener=opener)
        client.json = Mock(
            side_effect=[metadata, ValueError("Withdrawn")]
            if withdrawn
            else lambda _: metadata
        )
        return client

    def test_verified_download_and_failure_paths(self):
        target = self.root / "download.zip"
        self.client().download(
            "example.app", "1.2", target, lambda: False, lambda *_: None
        )
        self.assertEqual(target.read_bytes(), self.archive.read_bytes())
        for client, cancel in (
            (self.client(bad_hash=True), False),
            (self.client(), True),
            (self.client(withdrawn=True), False),
        ):
            with self.assertRaises(ValueError):
                client.download(
                    "example.app", "1.2", target, lambda: cancel, lambda *_: None
                )

    def job(self):
        usb = self.root / "usb"
        usb.mkdir()
        server = Mock()
        server.drive_lock = threading.RLock()
        server.bound_root.return_value = usb
        server.selected_root.return_value = usb
        jobs = CloudJobs(server, "https://registry.test")
        jobs.client = self.client()
        return jobs, usb

    def test_background_update_preserves_data_and_reports_partial_failure(self):
        jobs, usb = self.job()
        old = installer(self.root / "old.zip", "1.1")
        add_package(usb, old, "Example")
        data = usb / "packages/Example/data/recording.bin"
        data.write_bytes(b"keep")
        jobs.start(
            "selection",
            [
                {"package_id": "example.app", "version": "1.2"},
                {"package_id": "wrong.app", "version": "1.2"},
            ],
        )
        jobs.thread.join(5)
        result = jobs.snapshot()
        self.assertEqual(result["status"], "complete")
        self.assertTrue(result["results"][0]["success"])
        self.assertFalse(result["results"][1]["success"])
        self.assertEqual(data.read_bytes(), b"keep")

    def test_duplicate_destinations_require_selection(self):
        jobs, usb = self.job()
        for folder in ("First", "Second"):
            add_package(usb, self.archive, folder)
        with self.assertRaises(ValueError):
            destination(usb, {"package_id": "example.app"})
        self.assertEqual(
            destination(usb, {"package_id": "example.app", "folder": "Second"}),
            ("Second", True),
        )

    def test_drive_disconnect_prevents_publication(self):
        jobs, usb = self.job()
        jobs.server.bound_root.side_effect = [usb, ValueError("Drive disconnected")]
        jobs.start("selection", [{"package_id": "example.app", "version": "1.2"}])
        jobs.thread.join(5)
        self.assertFalse(jobs.snapshot()["results"][0]["success"])
        self.assertFalse((usb / "packages").exists())

    def test_invalid_metadata_and_unconfigured_registry_fail_closed(self):
        client = RegistryClient("https://registry.test")
        client.json = lambda _: {
            "package_id": "example.app",
            "version": "1.2",
            "sha256": "0" * 64,
            "size": 20,
            "download_url": "https://evil.test/package.zip",
        }
        with self.assertRaises(ValueError):
            client.version("example.app", "1.2")
        jobs = CloudJobs(Mock(), "")
        with self.assertRaises(ValueError):
            jobs.registry()


if __name__ == "__main__":
    unittest.main()
