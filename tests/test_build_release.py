"""Validate installable archive boundaries without using a vehicle."""

import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from tools.build_release import build, validate_apk


class BuildReleaseTests(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name)
        self.apk = self.root / "app.apk"

    def write_apk(self, members=None):
        if members is None:
            members = {
                "AndroidManifest.xml": b"manifest",
                "classes.dex": b"x" * 2048,
                "META-INF/DEBUG.RSA": b"signature",
            }
        with zipfile.ZipFile(self.apk, "w") as archive:
            for name, content in members.items():
                archive.writestr(name, content)

    def test_missing_small_and_non_archive_apks_are_rejected(self):
        with self.assertRaises(ValueError):
            validate_apk(self.apk)
        self.apk.write_bytes(b"small")
        with self.assertRaises(ValueError):
            validate_apk(self.apk)
        self.apk.write_bytes(b"x" * 2048)
        with self.assertRaisesRegex(ValueError, "valid ZIP"):
            validate_apk(self.apk)

    def test_required_members_and_kitkat_signature(self):
        for missing in ("AndroidManifest.xml", "classes.dex", "META-INF/DEBUG.RSA"):
            with self.subTest(missing=missing):
                members = {
                    "AndroidManifest.xml": b"x" * 2048,
                    "classes.dex": b"x" * 2048,
                    "META-INF/DEBUG.RSA": b"x" * 2048,
                }
                del members[missing]
                self.write_apk(members)
                with self.assertRaises(ValueError):
                    validate_apk(self.apk)

    def test_corrupt_members_rejected(self):
        self.write_apk()
        with patch.object(zipfile.ZipFile, "testzip", return_value="classes.dex"):
            with self.assertRaisesRegex(ValueError, "corrupt"):
                validate_apk(self.apk)

    def test_build_keeps_internal_installer_compressed_and_copies_docs(self):
        self.write_apk()
        output = self.root / "dist"
        output.mkdir()
        (output / "existing-directory").mkdir()
        build(self.apk, output)
        with zipfile.ZipFile(output / "usb.package.manager.zip") as archive:
            self.assertEqual(
                archive.read("app/UsbPackageManager.apk"), self.apk.read_bytes()
            )
            self.assertIn(b"id=usb.package.manager", archive.read("NEMESIS.data"))
        with zipfile.ZipFile(output / "usb-package-manager-ready.zip") as archive:
            self.assertIn("docs/SETUP-WINDOWS.md", archive.namelist())
            self.assertIn(b"type=execute", archive.read("NEMESIS.data"))
            self.assertEqual(
                archive.read("manager/usb.package.manager.zip"),
                (output / "usb.package.manager.zip").read_bytes(),
            )
            self.assertIn(
                b"Copying a new bundle does not update",
                archive.read("GETTING_STARTED.txt"),
            )
