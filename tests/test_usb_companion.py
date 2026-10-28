"""Exercise the companion against temporary directories, never physical USB drives."""

import http.client
import io
import json
import tempfile
import threading
import unittest
import zipfile
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

from tools.usb_companion import CompanionServer
from tools.companion_drives import checked_path, drive_root
from tools.companion_metadata import describe_package, scan_drive
from tools.companion_packages import add_package
from tools.companion_manager import setup_manager
from tools.companion_drives import drive_candidates
from tools.companion_metadata import package_metadata
from tools.companion_uploads import receive_file


def zipped(files):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return output.getvalue()


def payload(version="1.2", package_id="example"):
    return zipped(
        {
            "NEMESIS.data": f"[nemesis]\nid={package_id}\nname=Example\nversion={version}\ndescription=A demo package\n",
            "run.sh": "exit 0",
        }
    )


class CompanionFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.usb = self.base / "usb"
        self.usb.mkdir()
        self.release = self.base / "example.zip"
        self.release.write_bytes(payload())
        self.bundle = self.base / "manager.zip"
        self.bundle.write_bytes(
            zipped(
                {
                    "NEMESIS.data": "[nemesis]\ntype=execute\npath=NEMESIS.sh\n",
                    "NEMESIS.sh": "exit 0",
                    "manager/usb.package.manager.zip": payload(
                        "2.0", "usb.package.manager"
                    ),
                }
            )
        )


class CompanionTests(CompanionFixture):
    def test_mount_discovery_decodes_linux_mount_paths(self):
        contents = "1 2 3 4 /media/me/USB\\040DRIVE rest\n1 2 3 4 /run/media/me/USB rest\n1 2 3 4 /mnt/usb rest\n1 2 3 4 /usr rest\n"
        fake = SimpleNamespace(exists=lambda: True, read_text=lambda: contents)
        with (
            patch("tools.companion_drives.os", SimpleNamespace(name="posix")),
            patch("tools.companion_drives.Path", return_value=fake),
        ):
            self.assertEqual(
                drive_candidates(),
                ["/media/me/USB DRIVE", "/mnt/usb", "/run/media/me/USB"],
            )
        fake.exists = lambda: False
        with (
            patch("tools.companion_drives.os", SimpleNamespace(name="posix")),
            patch("tools.companion_drives.Path", return_value=fake),
        ):
            self.assertEqual(drive_candidates(), [])

    def test_manifest_limits_unknown_types_and_missing_versions(self):
        self.release.write_bytes(zipped({"NEMESIS.data": "[nemesis]\nid=demo\n"}))
        self.assertEqual(package_metadata(self.release)["version"], "")
        self.release.write_bytes(
            zipped(
                {
                    "NEMESIS.data": "[nemesis]\ntype=execute\npath=run.sh\nversion=1.0\n",
                    "run.sh": "exit 0",
                }
            )
        )
        with self.assertRaises(ValueError):
            package_metadata(self.release)
        add_package(self.usb, self.release, "Script")
        self.assertEqual(describe_package(self.usb, "Script")["version"], "")
        self.release.write_bytes(zipped({"NEMESIS.data": "X" * (1024 * 1024 + 1)}))
        with self.assertRaisesRegex(ValueError, "too large"):
            add_package(self.usb, self.release, "Large")
        self.assertFalse((self.usb / "packages/Large").exists())

    def test_bad_manager_and_source_descriptors_remain_visible(self):
        source = self.usb / "packages/Source"
        source.mkdir(parents=True)
        descriptor = source / "NEMESIS.data"
        descriptor.write_text("[nemesis]\nid=source\nversion=3.0\n")
        self.assertEqual(describe_package(self.usb, "Source")["version"], "3.0")
        for content in (
            "[nemesis]\n",
            "[nemesis]\ntype=install\npath=../other.zip\n",
            "[nemesis]\ntype=install\n",
            "x" * (1024 * 1024 + 1),
        ):
            descriptor.write_text(content)
            self.assertTrue(describe_package(self.usb, "Source")["error"])
        manager = self.usb / "manager"
        manager.mkdir()
        (manager / "usb.package.manager.zip").write_bytes(b"bad zip")
        self.assertTrue(scan_drive(self.usb)["manager"]["error"])

    def test_manager_identity_and_failed_setup_leave_no_partial_launcher(self):
        self.bundle.write_bytes(
            zipped(
                {
                    "NEMESIS.data": "[nemesis]\ntype=execute\npath=NEMESIS.sh\n",
                    "NEMESIS.sh": "script",
                    "manager/usb.package.manager.zip": payload(),
                }
            )
        )
        with self.assertRaisesRegex(ValueError, "does not contain"):
            setup_manager(self.usb, self.bundle)
        self.assertEqual(list(self.usb.iterdir()), [])
        self.bundle.write_bytes(
            zipped(
                {
                    "NEMESIS.data": "[nemesis]\ntype=execute\npath=NEMESIS.sh\n",
                    "NEMESIS.sh": "script",
                    "manager/usb.package.manager.zip": payload(
                        package_id="usb.package.manager"
                    ),
                }
            )
        )
        original = Path.open

        def fail_script(path, mode="r", *args, **kwargs):
            if path == self.usb / "NEMESIS.sh" and mode == "xb":
                raise OSError("Write failed")
            return original(path, mode, *args, **kwargs)

        with patch.object(Path, "open", fail_script), self.assertRaises(OSError):
            setup_manager(self.usb, self.bundle)
        self.assertFalse((self.usb / "NEMESIS.data").exists())

    def test_failed_rollback_keeps_recovery_files(self):
        add_package(self.usb, self.release, "Example")
        (self.usb / "packages/Example/data/export").write_text("keep")
        original = Path.rename

        def fail_publication_and_rollback(source, target):
            if (
                source.name == "previous"
                or source.name == "Example"
                and source.parent.name == "packages"
                and source.parent.parent != self.usb
            ):
                raise OSError("Drive unavailable")
            return original(source, target)

        with (
            patch.object(Path, "rename", fail_publication_and_rollback),
            self.assertRaisesRegex(OSError, "Recovery files"),
        ):
            add_package(self.usb, self.release, "Example", overwrite=True)
        recovery = list(self.usb.glob(".companion-*/previous/data/export"))
        self.assertEqual(len(recovery), 1)
        self.assertEqual(recovery[0].read_text(), "keep")

    def test_upload_stream_detects_truncated_input(self):
        output = io.BytesIO()
        receive_file(io.BytesIO(b"archive"), output, 7)
        self.assertEqual(output.getvalue(), b"archive")
        with self.assertRaisesRegex(ValueError, "interrupted"):
            receive_file(io.BytesIO(b"short"), io.BytesIO(), 100)

    def test_windows_archive_aliases_cannot_escape_staging(self):
        for name in (".. /outside", "folder./file", "CON.txt", "LPT1"):
            self.release.write_bytes(
                zipped({"NEMESIS.data": "[nemesis]\nid=demo\n", name: "bad"})
            )
            with (
                self.subTest(name=name),
                self.assertRaisesRegex(ValueError, "Nonportable"),
            ):
                add_package(self.usb, self.release, "Alias")
        self.assertFalse((self.usb / "packages/Alias").exists())

    def test_initial_setup_reads_inner_version_and_preserves_other_files(self):
        (self.usb / "recording.mp4").write_bytes(b"recording")
        setup_manager(self.usb, self.bundle)
        state = scan_drive(self.usb)
        self.assertEqual(state["manager"]["version"], "2.0")
        self.assertEqual(state["launcher"], "Active")
        self.assertEqual((self.usb / "recording.mp4").read_bytes(), b"recording")

    def test_manager_update_preserves_disabled_launcher_and_packages(self):
        setup_manager(self.usb, self.bundle)
        (self.usb / "NEMESIS.data").rename(self.usb / "NEMESIS.data.disabled")
        add_package(self.usb, self.release, "Example")
        setup_manager(self.usb, self.bundle, update=True)
        self.assertFalse((self.usb / "NEMESIS.data").exists())
        self.assertTrue((self.usb / "NEMESIS.data.disabled").exists())
        self.assertEqual(scan_drive(self.usb)["packages"][0]["version"], "1.2")
        with self.assertRaisesRegex(ValueError, "already exist|disabled"):
            setup_manager(self.usb, self.bundle)

    def test_setup_conflict_and_invalid_bundle_do_not_touch_drive(self):
        (self.usb / "NEMESIS.sh").write_text("custom")
        with self.assertRaises(ValueError):
            setup_manager(self.usb, self.bundle)
        self.assertFalse((self.usb / "NEMESIS.data").exists())
        (self.usb / "NEMESIS.sh").unlink()
        self.bundle.write_bytes(zipped({"NEMESIS.data": "invalid"}))
        with self.assertRaises(ValueError):
            setup_manager(self.usb, self.bundle)
        self.assertEqual(list(self.usb.iterdir()), [])

    def test_replacement_preserves_data_and_rejects_invalid_release(self):
        add_package(self.usb, self.release, "Example")
        directory = self.usb / "packages/Example"
        (directory / "data/recording").write_bytes(b"keep me")
        (directory / "stale.txt").write_text("old installer")
        self.release.write_bytes(payload("1.3"))
        with self.assertRaises(ValueError):
            add_package(self.usb, self.release, "Example")
        add_package(self.usb, self.release, "Example", overwrite=True)
        self.assertEqual((directory / "data/recording").read_bytes(), b"keep me")
        self.assertFalse((directory / "stale.txt").exists())
        self.assertEqual(describe_package(self.usb, "Example")["version"], "1.3")
        self.release.write_bytes(
            zipped({"NEMESIS.data": "[nemesis]\ntype=install\npath=missing.zip\n"})
        )
        with self.assertRaisesRegex(ValueError, "missing"):
            add_package(self.usb, self.release, "Example", overwrite=True)
        self.assertEqual(describe_package(self.usb, "Example")["version"], "1.3")
        self.assertEqual((directory / "data/recording").read_bytes(), b"keep me")

    def test_failed_publication_restores_original_installer_and_data(self):
        add_package(self.usb, self.release, "Example")
        directory = self.usb / "packages/Example"
        (directory / "data/export").write_text("keep")
        self.release.write_bytes(payload("new"))
        rename = Path.rename

        def fail_new(source, target):
            if (
                source.name == "Example"
                and source.parent.name == "packages"
                and source.parent.parent != self.usb
            ):
                raise OSError("Simulated drive failure")
            return rename(source, target)

        with patch.object(Path, "rename", fail_new), self.assertRaises(OSError):
            add_package(self.usb, self.release, "Example", overwrite=True)
        self.assertEqual(describe_package(self.usb, "Example")["version"], "1.2")
        self.assertEqual((directory / "data/export").read_text(), "keep")

    def test_scripts_source_and_broken_packages_have_clear_status(self):
        self.release.write_bytes(
            zipped(
                {
                    "NEMESIS.data": "[nemesis]\ntype=execute\npath=run.sh\nname=Utility\n",
                    "run.sh": "exit 0",
                }
            )
        )
        add_package(self.usb, self.release, "Utility")
        info = describe_package(self.usb, "Utility")
        self.assertEqual(info["name"], "Utility")
        self.assertEqual(info["version"], "")
        (self.usb / "packages/Utility/run.sh").unlink()
        self.assertIn("missing", describe_package(self.usb, "Utility")["error"])
        (self.usb / "packages/Utility/NEMESIS.data").write_text("not an INI")
        self.assertTrue(scan_drive(self.usb)["packages"][0]["error"])

    def test_traversal_and_system_paths_rejected(self):
        for name in ("../outside", "bad/name", "", "-bad"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                add_package(self.usb, self.release, name)
        with self.assertRaises(ValueError):
            checked_path(self.usb, "../outside")
        with self.assertRaises(ValueError):
            drive_root(Path.home())
        with self.assertRaises(ValueError):
            drive_root("relative")
        self.release.write_bytes(
            zipped({"../outside.txt": "bad", "NEMESIS.data": "[nemesis]\nid=bad\n"})
        )
        with self.assertRaises(ValueError):
            add_package(self.usb, self.release, "Bad")
        self.assertFalse((self.base / "outside.txt").exists())

    def test_linked_managed_directory_is_rejected(self):
        outside = self.base / "outside"
        outside.mkdir()
        try:
            (self.usb / "packages").symlink_to(outside, target_is_directory=True)
        except OSError:
            self.skipTest("Creating symlinks requires permission on this host")
        with self.assertRaises(ValueError):
            add_package(self.usb, self.release, "Example")
        self.assertEqual(list(outside.iterdir()), [])


class CompanionHttpTests(CompanionFixture):
    def setUp(self):
        super().setUp()
        self.server = CompanionServer()
        worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        worker.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(worker.join, 2)
        self.addCleanup(self.server.shutdown)

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection(
            "127.0.0.1", self.server.server_port, timeout=5
        )
        headers = {"X-Companion-Token": self.server.token, **(headers or {})}
        connection.request(method, path, body, headers)
        response = connection.getresponse()
        result = response.status, response.read()
        connection.close()
        return result

    def test_http_select_import_and_assets(self):
        status, body = self.request("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertIsNone(json.loads(body)["drive"])
        status, body = self.request(
            "POST", "/api/select", json.dumps({"path": str(self.usb)})
        )
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["path"], str(self.usb))
        status, body = self.request(
            "POST", "/api/package?name=Example", self.release.read_bytes()
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(json.loads(body)["packages"][0]["version"], "1.2")
        for path in ("/", "/app.js", "/style.css"):
            self.assertEqual(self.request("GET", path)[0], 200)
        self.assertEqual(self.request("GET", "/missing")[0], 404)

    def test_http_rejects_cross_origin_bad_token_and_host(self):
        for headers in (
            {"Origin": "https://example.org"},
            {"X-Companion-Token": "wrong"},
            {"Host": "evil.example"},
        ):
            self.assertEqual(
                self.request(
                    "POST", "/api/select", json.dumps({"path": str(self.usb)}), headers
                )[0],
                403,
            )
        self.assertIsNone(self.server.usb)
        self.assertEqual(list(self.usb.iterdir()), [])

    def test_http_invalid_selection_upload_and_missing_drive(self):
        self.assertEqual(
            self.request("POST", "/api/package?name=Example", b"zip")[0], 400
        )
        self.assertEqual(self.request("POST", "/api/select", "[]")[0], 400)
        self.assertEqual(self.request("POST", "/api/select", "bad JSON")[0], 400)
        self.assertEqual(
            self.request("POST", "/api/select", json.dumps({"path": str(self.usb)}))[0],
            200,
        )
        self.assertEqual(
            self.request("POST", "/api/package?name=Example", b"bad ZIP")[0], 400
        )
        self.assertEqual(self.request("POST", "/api/package?name=Example", b"")[0], 400)
        self.assertEqual(
            self.request("POST", "/api/setup", self.bundle.read_bytes())[0], 200
        )
        self.assertEqual(
            self.request("POST", "/api/update-manager", self.bundle.read_bytes())[0],
            200,
        )

    def test_drive_identity_change_blocks_writes_and_rescan(self):
        self.request("POST", "/api/select", json.dumps({"path": str(self.usb)}))
        self.server.device = -1
        self.assertEqual(
            self.request(
                "POST", "/api/package?name=Example", self.release.read_bytes()
            )[0],
            400,
        )
        self.assertEqual(self.request("GET", "/api/state")[0], 400)
        self.assertEqual(list(self.usb.iterdir()), [])

    def test_request_limits_and_unauthenticated_reads(self):
        self.assertEqual(
            self.request("GET", "/api/state", headers={"X-Companion-Token": ""})[0], 403
        )
        self.assertEqual(self.request("POST", "/api/unknown", b"x")[0], 404)
        self.assertEqual(self.request("POST", "/api/select", b"x" * 8193)[0], 400)
        self.assertEqual(self.request("POST", "/api/select", b"")[0], 400)
        self.request("POST", "/api/select", json.dumps({"path": str(self.usb)}))
        with patch("tools.companion_uploads.MAX_UPLOAD", 1):
            self.assertEqual(self.request("POST", "/api/package", b"too large")[0], 400)


class CompanionLaunchTests(unittest.TestCase):
    def test_launch_opens_browser_and_ctrl_c_closes_server(self):
        from tools.usb_companion import main

        with (
            patch("sys.argv", ["companion"]),
            patch("tools.usb_companion.CompanionServer") as factory,
            patch("tools.usb_companion.webbrowser.open") as browser,
            patch("builtins.print"),
        ):
            server = factory.return_value.__enter__.return_value
            server.serve_forever.side_effect = KeyboardInterrupt
            main()
            browser.assert_called_once_with(server.url)
            factory.return_value.__exit__.assert_called_once()

    def test_launch_without_browser_and_with_preselected_drive(self):
        from tools.usb_companion import main

        with (
            patch(
                "sys.argv",
                ["companion", "--no-browser", "--port", "8765", "--usb", "/media/usb"],
            ),
            patch("tools.usb_companion.CompanionServer") as factory,
            patch("tools.usb_companion.webbrowser.open") as browser,
            patch("builtins.print"),
        ):
            main()
            factory.assert_called_once_with(8765, "/media/usb")
            browser.assert_not_called()
