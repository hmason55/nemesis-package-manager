"""Package identity must be verified before a replacement can remove old files."""

import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from tools.companion_installers import package_metadata
from tools.companion_identity import validate_package_id
from tools.companion_metadata import describe_package, scan_drive
from tools.companion_packages import add_package


def zipped(files):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return output.getvalue()


class CompanionIdentityTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.usb = self.root / "usb"
        self.usb.mkdir()
        self.archive = self.root / "release.zip"

    def installer(self, package_id="example.app", version="1.0"):
        self.archive.write_bytes(
            zipped(
                {
                    "NEMESIS.data": f"[nemesis]\nid={package_id}\nversion={version}\n",
                }
            )
        )
        return self.archive

    def existing(self):
        add_package(self.usb, self.installer(), "Example")
        self.destination = self.usb / "packages/Example"
        (self.destination / "data/recording.bin").write_bytes(b"keep recording")
        return {
            p.relative_to(self.destination): p.read_bytes()
            for p in self.destination.rglob("*")
            if p.is_file()
        }

    def assert_preserved(self, previous):
        self.assertEqual(
            previous,
            {
                p.relative_to(self.destination): p.read_bytes()
                for p in self.destination.rglob("*")
                if p.is_file()
            },
        )
        self.assertFalse(list(self.usb.glob(".companion-*")))

    def test_mismatched_and_invalid_id_updates_preserve_installer_and_recordings(self):
        previous = self.existing()
        for package_id in ("different.app", "bad..id", "bad id", "a" * 65):
            with self.subTest(package_id=package_id):
                with self.assertRaisesRegex(
                    ValueError, "different package|Invalid package ID"
                ):
                    add_package(self.usb, self.installer(package_id), "Example", True)
                self.assert_preserved(previous)

    def test_matching_id_updates_version_and_preserves_recordings(self):
        self.existing()
        add_package(self.usb, self.installer(version="2.0"), "Example", True)
        self.assertEqual(describe_package(self.usb, "Example")["version"], "2.0")
        self.assertEqual(
            (self.destination / "data/recording.bin").read_bytes(), b"keep recording"
        )

    def test_unreadable_previous_identity_is_not_silently_replaced(self):
        self.existing()
        (self.destination / "payload.zip").write_bytes(b"broken installer")
        previous = {
            p.relative_to(self.destination): p.read_bytes()
            for p in self.destination.rglob("*")
            if p.is_file()
        }
        with self.assertRaisesRegex(ValueError, "Cannot verify.*new folder"):
            add_package(self.usb, self.installer(), "Example", True)
        self.assert_preserved(previous)

    def test_script_without_id_can_be_added_but_not_replaced(self):
        self.archive.write_bytes(
            zipped(
                {
                    "NEMESIS.data": "[nemesis]\ntype=execute\npath=run.sh\n",
                    "run.sh": "exit 0\n",
                }
            )
        )
        add_package(self.usb, self.archive, "Script")
        self.assertFalse(describe_package(self.usb, "Script")["error"])
        with self.assertRaisesRegex(ValueError, "Cannot verify.*new folder"):
            add_package(self.usb, self.archive, "Script", True)

    def test_same_script_id_is_allowed_but_script_cannot_replace_installer(self):
        self.archive.write_bytes(
            zipped(
                {
                    "NEMESIS.data": "[nemesis]\ntype=execute\nid=example.app\npath=run.sh\n",
                    "run.sh": "exit 0\n",
                }
            )
        )
        add_package(self.usb, self.archive, "Script")
        add_package(self.usb, self.archive, "Script", True)
        with self.assertRaisesRegex(ValueError, "different package"):
            add_package(self.usb, self.installer(), "Script", True)

    def test_id_rules_match_android_boundaries(self):
        for value in ("a", "_app", "-app", "A-z.0_1", "a" * 64):
            validate_package_id(value)
            self.assertEqual(package_metadata(self.installer(value))["id"], value)
        for value in ("", ".app", "app..id", "app/id", "app id", "é", "a" * 65):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_package_id(value)

    def test_invalid_loose_and_source_packages_report_attention(self):
        packages = self.usb / "packages"
        packages.mkdir()
        (packages / "invalid.zip").write_bytes(self.installer("bad..id").read_bytes())
        source = packages / "Source"
        source.mkdir()
        (source / "NEMESIS.data").write_text("[nemesis]\nid=bad..id\n")
        for row in scan_drive(self.usb)["packages"]:
            self.assertIn("Invalid package ID", row["error"])


if __name__ == "__main__":
    unittest.main()
