"""Archive rejection, wrapped layouts, and importer CLI regressions."""

import runpy
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import Mock, patch

from test_importer import mod


class ArchiveValidationTests(unittest.TestCase):
    def test_manifest_requires_section(self):
        with self.assertRaises(ValueError):
            mod.read_config(b"[other]\nid=demo\n")

    def test_resource_limits_and_unsafe_names(self):
        archive = Mock()
        archive.infolist.return_value = [Mock(file_size=0)] * (mod.MAX_ENTRIES + 1)
        with self.assertRaisesRegex(ValueError, "too many"):
            mod.safe_zip(archive)
        archive.infolist.return_value = [Mock(file_size=mod.MAX_UNCOMPRESSED + 1)]
        with self.assertRaisesRegex(ValueError, "size limit"):
            mod.safe_zip(archive)
        for name in ("/absolute", "../escape", "dir\\escape", "C:escape"):
            archive.infolist.return_value = [
                Mock(filename=name, file_size=0, external_attr=0)
            ]
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "unsafe"):
                mod.safe_zip(archive)
        archive.infolist.return_value = [
            Mock(filename="link", file_size=0, external_attr=0o120777 << 16)
        ]
        with self.assertRaisesRegex(ValueError, "symlink"):
            mod.safe_zip(archive)

    def test_wrapped_packages_and_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for descriptor, expected in [
                ("[nemesis]\nid=demo\n", "pkg"),
                ("[nemesis]\ntype=execute\npath=run.sh\n", "usb"),
            ]:
                source = root / "demo-usb.zip"
                with zipfile.ZipFile(source, "w") as archive:
                    archive.writestr("release/", "")
                    archive.writestr("release/NEMESIS.data", descriptor)
                    archive.writestr("release/run.sh", "exit 0")
                    archive.writestr("release/assets/", "")
                    archive.writestr("unrelated.txt", "ignored")
                destination, kind = mod.import_release(
                    source, root / "usb", overwrite=True
                )
                self.assertEqual(kind, expected)
                (destination / "old").mkdir(exist_ok=True)
                (destination / "stale.txt").write_text("old")
                mod.import_release(source, root / "usb", overwrite=True)
                self.assertFalse((destination / "old").exists())
                self.assertFalse((destination / "stale.txt").exists())
                self.assertFalse((destination / "unrelated.txt").exists())

    def test_invalid_sources_names_and_descriptors(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ValueError):
                mod.import_release(root / "missing.zip", root / "usb")
            source = root / "input.txt"
            source.write_text("not zip")
            with self.assertRaises(ValueError):
                mod.import_release(source, root / "usb")
            source = root / "demo.zip"
            for manifest in ("[nemesis]\ntype=unsupported\n", "[other]\nid=demo\n"):
                with zipfile.ZipFile(source, "w") as archive:
                    archive.writestr("NEMESIS.data", manifest)
                with self.assertRaises(ValueError):
                    mod.import_release(source, root / "usb")
            with self.assertRaises(ValueError):
                mod.import_release(source, root / "usb", "../unsafe")
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("readme.txt", "no descriptor")
            with self.assertRaises(ValueError):
                mod.import_release(source, root / "usb")

    def test_cli_import(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "demo.zip"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("NEMESIS.data", "[nemesis]\nid=demo\n")
            with patch.object(
                sys, "argv", ["import_release", str(source), "--usb", str(root / "usb")]
            ):
                runpy.run_path(str(Path(mod.__file__)), run_name="__main__")
            self.assertTrue((root / "usb/packages/demo/payload.zip").is_file())
