#!/usr/bin/env python3
"""Build a NEMESIS install ZIP and one-root-descriptor USB launcher bundle."""

try:
    from tools.bundle_templates import PACKAGE_MANIFEST, USB_MANIFEST, LAUNCHER
except ModuleNotFoundError:
    from bundle_templates import PACKAGE_MANIFEST, USB_MANIFEST, LAUNCHER

import argparse
import zipfile
from pathlib import Path

try:
    from tools.apk_validation import validate_apk
except ModuleNotFoundError:
    from apk_validation import validate_apk


def build(apk: Path, dist: Path):
    validate_apk(apk)
    dist.mkdir(parents=True, exist_ok=True)
    package = dist / "usb.package.manager.zip"
    with zipfile.ZipFile(package, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("NEMESIS.data", PACKAGE_MANIFEST)
        z.write(apk, "app/UsbPackageManager.apk")
    docs_dir = Path(__file__).resolve().parent.parent / "docs"
    with zipfile.ZipFile(
        dist / "usb-package-manager-ready.zip", "w", zipfile.ZIP_DEFLATED
    ) as z:
        z.writestr("NEMESIS.data", USB_MANIFEST)
        z.writestr("NEMESIS.sh", LAUNCHER)
        z.write(package, "manager/usb.package.manager.zip")
        z.writestr(
            "GETTING_STARTED.txt",
            "NEMESIS PACKAGE MANAGER - EXPERIMENTAL\n"
            "Requires NEMESIS already installed.\n"
            "Copy these extracted files to the USB ROOT, not a nested directory.\n"
            "On insert, confirm NEMESIS execute to install/launch the manager.\n"
            "Add each USB-ready release under packages/<Name>/ with its own NEMESIS.data.\n"
            "First launch disables the root descriptor to prevent repeated prompts.\n"
            "Use NEMESIS Manager -> Packages -> Package Manager -> Launch after first install.\n"
            "Open Package Manager through NEMESIS Manager after setup.\n"
            "Copying a new bundle does not update an already-installed manager.\n"
            "Update Package Manager through NEMESIS's installer; see docs/UPDATING.md.\n"
            "Package Manager is hidden from its own package list.\n"
            "Both manager UIs share installed packages; finish one operation before starting another.\n"
            "Read docs/SETUP-WINDOWS.md for complete steps and warnings.\n",
        )
        for path in sorted(docs_dir.glob("*.md")):
            z.write(path, "docs/" + path.name)
        z.writestr("packages/", "")
        z.writestr(
            "packages/README.txt",
            "Place each extracted USB-ready release in its own subfolder.\nEach subfolder may have NEMESIS.data and data/.\nDo not overwrite the USB root NEMESIS.data.\n",
        )
    for p in sorted(dist.iterdir()):
        if p.is_file():
            print(p, p.stat().st_size)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("apk", type=Path)
    p.add_argument("--dist", type=Path, default=Path("dist"))
    a = p.parse_args()
    build(a.apk, a.dist)
