"""Exercise USB preparation using temporary drives."""

import importlib.util
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from prepare_usb import main


class PrepareUsbTests(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name)
        self.usb = self.root / "usb"
        self.bundle = self.root / "manager.zip"

    def bundle_files(self, extra=None):
        members = {
            "NEMESIS.data": "[nemesis]\ntype=execute\npath=NEMESIS.sh\n",
            "NEMESIS.sh": "exit 0",
            "manager/usb.package.manager.zip": "fixture",
            "packages/": "",
        }
        members.update(extra or {})
        with zipfile.ZipFile(self.bundle, "w") as archive:
            for name, content in members.items():
                archive.writestr(name, content)

    def run_prepare(self, *arguments):
        with patch.object(
            sys,
            "argv",
            [
                "prepare_usb",
                "--usb",
                str(self.usb),
                "--bundle",
                str(self.bundle),
                *arguments,
            ],
        ):
            main()

    def test_missing_members_fail(self):
        with zipfile.ZipFile(self.bundle, "w") as archive:
            archive.writestr("NEMESIS.data", "fixture")
        with self.assertRaisesRegex(ValueError, "missing required"):
            self.run_prepare()

    def test_prepare_import_and_overwrite_preserve_exports(self):
        self.bundle_files()
        release = self.root / "demo.zip"
        with zipfile.ZipFile(release, "w") as archive:
            archive.writestr("NEMESIS.data", "[nemesis]\nid=demo\n")
        self.run_prepare("--add", str(release))
        data = self.usb / "packages/demo/data/export.txt"
        data.write_text("user data", encoding="utf-8")
        with self.assertRaises(FileExistsError):
            self.run_prepare()
        self.run_prepare("--overwrite", "--add", str(release))
        self.assertEqual(data.read_text(encoding="utf-8"), "user data")
        self.assertTrue((self.usb / "NEMESIS.sh").exists())
