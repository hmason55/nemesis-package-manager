#!/usr/bin/env python3
"""Build a NEMESIS install ZIP and one-root-descriptor USB launcher bundle."""
import argparse
import zipfile
from pathlib import Path

PACKAGE_MANIFEST = """[nemesis]
version=0.1.0
id=usb.package.manager
name=USB Package Manager
types=application

[app.0]
kind=apk
path=app/UsbPackageManager.apk
package=dev.nemesis.usbmanager
component=dev.nemesis.usbmanager/.MainActivity
"""
USB_MANIFEST = """[nemesis]
version=1.0
type=execute
path=NEMESIS.sh
"""
LAUNCHER = """#!/system/bin/sh
# Run by NEMESIS with root rights and USB root as cwd.
# Install manager only if missing, then launch. Never modify package folders.
export PATH=/data/nemesis/bin:/sbin:/vendor/bin:/system/sbin:/system/bin:/system/xbin
if [ "$(getprop sys.boot_completed)" != "1" ]; then
    echo "USB manager: Android not ready, not installing or launching."
    exit 0
fi
ROOT=""
for CANDIDATE in /storage/usb0 /storage/usb1 /storage/usb2 /mnt/media_rw/usb0 /mnt/media_rw/usb1 /mnt/media_rw/usb2; do
    if [ -f "$CANDIDATE/manager/usb.package.manager.zip" ]; then
        ROOT="$CANDIDATE"
        break
    fi
done
if [ -z "$ROOT" ]; then
    echo "USB manager: manager/usb.package.manager.zip not found."
    exit 1
fi
if ! /system/xbin/nemesis pkg-list | grep -q '^usb.package.manager|'; then
    echo "Installing USB Package Manager..."
    /system/xbin/nemesis install "$ROOT/manager/usb.package.manager.zip" || exit 1
fi
/system/bin/am start -n dev.nemesis.usbmanager/.MainActivity
"""


def validate_apk(apk: Path):
    """Catch accidental packaging of placeholders or empty build outputs.

    This is a structural check, not runtime compatibility or cryptographic verification.
    """
    if not apk.is_file() or apk.stat().st_size < 1000:
        raise ValueError(f'APK must be built first: {apk}')
    try:
        with zipfile.ZipFile(apk) as z:
            names = set(z.namelist())
            required = {'AndroidManifest.xml', 'classes.dex'}
            if not required.issubset(names):
                raise ValueError('APK lacks AndroidManifest.xml or classes.dex')
            if not any(n.startswith('META-INF/') and n.upper().endswith('.RSA') for n in names):
                raise ValueError('APK appears unsigned or lacks Android 4.4-compatible v1 JAR signature')
            if z.testzip() is not None:
                raise ValueError('APK has corrupt ZIP members')
    except zipfile.BadZipFile as ex:
        raise ValueError('APK is not a valid ZIP archive') from ex


def build(apk: Path, dist: Path):
    validate_apk(apk)
    dist.mkdir(parents=True, exist_ok=True)
    package = dist / 'usb.package.manager.zip'
    with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('NEMESIS.data', PACKAGE_MANIFEST)
        z.write(apk, 'app/UsbPackageManager.apk')
    docs_dir = Path(__file__).resolve().parent.parent / 'docs'
    with zipfile.ZipFile(dist / 'usb-package-manager-ready.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('NEMESIS.data', USB_MANIFEST)
        z.writestr('NEMESIS.sh', LAUNCHER)
        z.write(package, 'manager/usb.package.manager.zip')
        z.writestr('GETTING_STARTED.txt',
            'NEMESIS USB PACKAGE MANAGER - EXPERIMENTAL\n'
            'Requires NEMESIS already installed.\n'
            'Copy these extracted files to the USB ROOT, not a nested directory.\n'
            'On insert, confirm NEMESIS execute to install/launch the manager.\n'
            'Add each USB-ready release under packages/<Name>/ with its own NEMESIS.data.\n'
            'Do not overwrite the ROOT NEMESIS.data with third-party descriptors.\n'
            'Use NEMESIS Manager -> Packages -> USB Package Manager -> Launch after first install.\n'
            'The execute prompt can recur on later USB insertions.\n'
            'Copying a new bundle does not update an already-installed manager.\n'
            'For explicit manager updates, follow section E of docs/SETUP-WINDOWS.md.\n'
            'Both manager UIs share installed packages; finish one operation before starting another.\n'
            'Read docs/SETUP-WINDOWS.md for complete steps and warnings.\n')
        for path in sorted(docs_dir.glob('*.md')):
            z.write(path, 'docs/' + path.name)
        z.writestr('packages/', '')
        z.writestr('packages/README.txt', 'Place each extracted USB-ready release in its own subfolder.\nEach subfolder may have NEMESIS.data and data/.\nDo not overwrite the USB root NEMESIS.data.\n')
    for p in sorted(dist.iterdir()):
        if p.is_file(): print(p, p.stat().st_size)

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('apk', type=Path)
    p.add_argument('--dist', type=Path, default=Path('dist'))
    a = p.parse_args()
    build(a.apk, a.dist)
