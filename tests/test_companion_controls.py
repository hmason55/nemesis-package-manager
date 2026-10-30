"""Check USB actions on disposable fixtures and mock public release metadata."""

import io
import json
import http.client
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from test_usb_companion import CompanionFixture, payload
from tools.companion_actions import remove_package, handle_action
from tools.companion_launcher import set_launcher, launcher_state, GUARD
from tools.companion_packages import add_package
from tools.companion_releases import latest_release, version_key
from tools.companion_server import CompanionServer
from tools.companion_manager import setup_manager
from tools.bundle_templates import LAUNCHER


class USBControlTests(CompanionFixture):
    def package(self):
        add_package(self.usb, self.release, "Example")
        data = self.usb / "packages/Example/data"
        data.mkdir(exist_ok=True)
        (data / "recording").write_text("keep")
        return data

    def test_remove_keeps_data_by_default_and_reimport_preserves_it(self):
        data = self.package()
        remove_package(self.usb, "packages/Example")
        self.assertEqual((data / "recording").read_text(), "keep")
        self.assertFalse((data.parent / "NEMESIS.data").exists())
        add_package(self.usb, self.release, "Example")
        self.assertEqual((data / "recording").read_text(), "keep")
        remove_package(self.usb, "packages/Example", True)
        self.assertFalse(data.parent.exists())
        self.assertEqual(list(self.usb.glob(".companion-remove-*")), [])

    def test_loose_zip_removal_keeps_shared_files_and_rejects_data_deletion(self):
        (self.usb / "packages").mkdir()
        path = self.usb / "packages/loose.zip"
        path.write_bytes(payload())
        for relative in (
            "../outside",
            "packages",
            "manager/usb.package.manager.zip",
            None,
            [],
        ):
            with self.assertRaises(ValueError):
                remove_package(self.usb, relative)
        with self.assertRaises(ValueError):
            remove_package(self.usb, "packages/loose.zip", True)
        with self.assertRaises(ValueError):
            remove_package(self.usb, "packages/loose.zip", "true")
        remove_package(self.usb, "packages/loose.zip")
        self.assertFalse(path.exists())

    def test_remove_io_failure_reports_recovery_files_without_erasing_data(self):
        data = self.package()
        with patch(
            "tools.companion_actions.shutil.rmtree", side_effect=OSError("fixture")
        ):
            with self.assertRaisesRegex(OSError, "recovery"):
                remove_package(self.usb, "packages/Example")
        self.assertTrue((data / "recording").exists())
        self.assertEqual(len(list(self.usb.glob(".companion-remove-*"))), 1)

    def test_launcher_round_trip_keeps_backups_and_upgrades_only_known_script(self):
        setup_manager(self.usb, self.bundle)
        script = self.usb / "NEMESIS.sh"
        script.write_text(LAUNCHER.replace(GUARD, ""))
        (self.usb / "NEMESIS.data.disabled").write_text("unrelated backup")
        set_launcher(self.usb, False)
        self.assertTrue((self.usb / "NEMESIS.data.disabled.1").exists())
        self.assertFalse(launcher_state(self.usb)["enabled"])
        set_launcher(self.usb, True)
        self.assertTrue(launcher_state(self.usb)["persistent"])
        self.assertIn(GUARD, script.read_text())
        self.assertEqual(
            (self.usb / "NEMESIS.data.disabled").read_text(), "unrelated backup"
        )
        set_launcher(self.usb, True)
        set_launcher(self.usb, False)
        self.assertFalse((self.usb / "manager/auto-launch.enabled").exists())
        script.write_text("custom script")
        with self.assertRaisesRegex(ValueError, "Custom"):
            set_launcher(self.usb, True)
        with self.assertRaises(ValueError):
            set_launcher(self.usb, "yes")
        (self.usb / "NEMESIS.data").write_text(
            "[nemesis]\ntype=install\npath=other.zip\n"
        )
        with self.assertRaisesRegex(ValueError, "unrelated"):
            set_launcher(self.usb, True)

    def test_unprepared_and_malformed_descriptors_are_not_toggleable(self):
        self.assertFalse(launcher_state(self.usb)["available"])
        (self.usb / "NEMESIS.data").write_text("not an ini")
        self.assertFalse(launcher_state(self.usb)["available"])

    def test_volume_changed_during_json_read_keeps_package_and_data(self):
        data = self.package()
        with CompanionServer(usb=self.usb) as server:

            class ChangedDrive(io.BytesIO):
                def read(self, size=-1):
                    body = super().read(size)
                    server.device = -1
                    return body

            body = json.dumps(
                {"path": "packages/Example", "delete_data": True}
            ).encode()
            handler = SimpleNamespace(
                server=server,
                headers={"X-Companion-Drive": server.selection_id},
                rfile=ChangedDrive(body),
            )
            with self.assertRaisesRegex(ValueError, "Drive changed"):
                handle_action(handler, "/api/remove", len(body))
            self.assertEqual((data / "recording").read_text(), "keep")
            self.assertTrue((data.parent / "NEMESIS.data").is_file())

    def test_json_actions_require_current_drive_binding(self):
        self.package()
        setup_manager(self.usb, self.bundle)
        (self.usb / "NEMESIS.sh").write_text(LAUNCHER)
        server = CompanionServer(usb=self.usb)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        self.addCleanup(server.server_close)
        self.addCleanup(worker.join, 2)
        self.addCleanup(server.shutdown)

        def post(route, data, binding=None):
            connection = http.client.HTTPConnection(
                "127.0.0.1", server.server_port, timeout=5
            )
            body = json.dumps(data)
            headers = {
                "X-Companion-Token": server.token,
                "X-Companion-Drive": binding or server.selection_id,
            }
            if binding == "stale":
                headers["Content-Length"] = str(len(body))
                body = None
            connection.request("POST", route, body, headers)
            response = connection.getresponse()
            result = response.status, json.loads(response.read())
            connection.close()
            return result

        self.assertEqual(
            post(
                "/api/remove",
                {"path": "packages/Example", "delete_data": True},
                "stale",
            )[0],
            400,
        )
        self.assertTrue((self.usb / "packages/Example/data/recording").exists())
        self.assertEqual(post("/api/launcher", {"enabled": False})[0], 200)
        self.assertEqual(post("/api/launcher", [])[0], 400)
        status, state = post(
            "/api/remove", {"path": "packages/Example", "delete_data": False}
        )
        self.assertEqual(status, 200)
        self.assertEqual(state["packages"], [])


class ReleaseCheckTests(unittest.TestCase):
    def test_latest_includes_published_prereleases_with_manager_download(self):
        rows = [
            {
                "tag_name": "v0.2.0-build.65",
                "prerelease": True,
                "assets": [{"name": "usb-package-manager-ready.zip"}],
            },
            {"tag_name": "v9.0.0", "draft": True},
            {"tag_name": "custom", "assets": []},
        ]
        with patch(
            "tools.companion_releases.urlopen",
            return_value=io.BytesIO(json.dumps(rows).encode()),
        ) as fetch:
            release = latest_release()
        self.assertEqual(release["version"], "0.2.0-build.65")
        self.assertTrue(release["prerelease"])
        self.assertEqual(
            release["url"],
            "https://github.com/hmason55/nemesis-package-manager/releases/tag/v0.2.0-build.65",
        )
        self.assertEqual(fetch.call_args.kwargs["timeout"], 4)
        self.assertGreater(version_key("1.0.0"), version_key("0.2.0-build.99"))
        self.assertEqual(version_key("v1.2"), (1, 2, 0, 0))
        self.assertIsNone(version_key("unknown"))

    def test_offline_malformed_oversized_and_empty_responses_do_not_block_usb_use(self):
        with patch("tools.companion_releases.urlopen", side_effect=OSError("offline")):
            self.assertIn("offline", latest_release()["error"])
        for data in (b"bad JSON", b"[]", b"{}", b"null", b"x" * (512 * 1024 + 1)):
            with patch(
                "tools.companion_releases.urlopen", return_value=io.BytesIO(data)
            ):
                self.assertTrue(latest_release()["error"])
