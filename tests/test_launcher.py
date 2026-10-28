"""Check first-run descriptor handling without touching any real USB mount."""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from tools.bundle_templates import LAUNCHER, USB_MANIFEST


class LauncherTests(unittest.TestCase):
    def test_disables_only_own_descriptor_and_preserves_existing_backup(self):
        shell = (
            "C:/Program Files/Git/bin/bash.exe"
            if os.name == "nt"
            else shutil.which("bash")
        )
        for descriptor, backup, disabled in [
            (USB_MANIFEST, False, True),
            ("[nemesis]\ntype=install\npath=other.zip\n", False, False),
            (USB_MANIFEST, True, True),
        ]:
            with (
                self.subTest(descriptor=descriptor, backup=backup),
                tempfile.TemporaryDirectory() as directory,
            ):
                root = Path(directory)
                (root / "manager").mkdir()
                (root / "manager/usb.package.manager.zip").write_bytes(b"fixture")
                (root / "NEMESIS.data").write_text(
                    descriptor, encoding="utf-8", newline="\n"
                )
                if backup:
                    (root / "NEMESIS.data.disabled").write_text("existing backup")
                script = LAUNCHER.replace("$(getprop sys.boot_completed)", "1")
                script = (
                    "\n".join(
                        "export PATH=/usr/bin:/bin:$PATH"
                        if line.startswith("export PATH=")
                        else line
                        for line in script.splitlines()
                    )
                    + "\n"
                )
                script = script.replace(
                    "/system/xbin/nemesis", 'sh "$PWD/mock-nemesis.sh"'
                )
                script = script.replace(
                    "/system/bin/am start -n dev.nemesis.usbmanager/.MainActivity",
                    "true",
                )
                (root / "mock-nemesis.sh").write_text(
                    'echo "usb.package.manager|Package Manager|0|application"\n',
                    encoding="utf-8",
                )
                (root / "launcher.sh").write_text(
                    script, encoding="utf-8", newline="\n"
                )
                subprocess.run(
                    [shell, "launcher.sh"], cwd=root, check=True, capture_output=True
                )
                self.assertEqual((root / "NEMESIS.data").exists(), not disabled)
                if disabled and not backup:
                    self.assertEqual(
                        (root / "NEMESIS.data.disabled").read_text(), descriptor
                    )
                if backup:
                    self.assertEqual(
                        (root / "NEMESIS.data.disabled").read_text(), "existing backup"
                    )
