"""USB launcher and package descriptors kept separate from archive construction."""

import os

PACKAGE_MANIFEST = """[nemesis]
version=0.2.0
id=usb.package.manager
name=Package Manager
types=application

[app.0]
kind=apk
path=app/UsbPackageManager.apk
package=dev.nemesis.usbmanager
component=dev.nemesis.usbmanager/.MainActivity
"""
PACKAGE_MANIFEST = PACKAGE_MANIFEST.replace(
    "version=0.2.0", "version=" + os.environ.get("NEMESIS_RELEASE_VERSION", "0.2.0"), 1
)


USB_MANIFEST = """[nemesis]
version=1.0
type=execute
path=NEMESIS.sh
"""


LAUNCHER = """#!/system/bin/sh
# Run by NEMESIS with root rights and USB root as cwd.
# Install if missing, launch, then disable only this launcher's root descriptor.
export PATH=/data/nemesis/bin:/sbin:/vendor/bin:/system/sbin:/system/bin:/system/xbin
if [ "$(getprop sys.boot_completed)" != "1" ]; then
    echo "Package Manager: Android not ready, not installing or launching."
    exit 0
fi
ROOT=""
if [ -f "$PWD/manager/usb.package.manager.zip" ]; then ROOT="$PWD"; fi
for CANDIDATE in /storage/usb0 /storage/usb1 /storage/usb2 /mnt/media_rw/usb0 /mnt/media_rw/usb1 /mnt/media_rw/usb2; do
    if [ -z "$ROOT" ] && [ -f "$CANDIDATE/manager/usb.package.manager.zip" ]; then
        ROOT="$CANDIDATE"
        break
    fi
done
if [ -z "$ROOT" ]; then
    echo "Package Manager: manager/usb.package.manager.zip not found."
    exit 1
fi
if ! /system/xbin/nemesis pkg-list | grep -q '^usb.package.manager|'; then
    echo "Installing Package Manager..."
    /system/xbin/nemesis install "$ROOT/manager/usb.package.manager.zip" || exit 1
fi
/system/bin/am start -n dev.nemesis.usbmanager/.MainActivity || exit 1
# Keep the original descriptor as a backup; never touch another installer type.
if grep -q '^type=execute$' "$ROOT/NEMESIS.data" && grep -q '^path=NEMESIS.sh$' "$ROOT/NEMESIS.data"; then
    BACKUP="$ROOT/NEMESIS.data.disabled"
    NUMBER=0
    while [ -e "$BACKUP" ]; do
        NUMBER=$((NUMBER + 1))
        BACKUP="$ROOT/NEMESIS.data.disabled.$NUMBER"
    done
    mv "$ROOT/NEMESIS.data" "$BACKUP" || exit 1
    echo "Package Manager: automatic USB launch disabled. Open from NEMESIS Manager."
fi
"""


GETTING_STARTED = (
    "NEMESIS PACKAGE MANAGER - "
    + ("STABLE" if os.environ.get("RELEASE_CHANNEL") == "stable" else "EXPERIMENTAL")
    + "\n"
    + "Requires NEMESIS already installed.\nCopy these extracted files to the USB ROOT, not a nested directory.\nOn insert, confirm NEMESIS execute to install/launch the manager.\nAdd each USB-ready release under packages/<Name>/ with its own NEMESIS.data.\nFirst launch disables the root descriptor to prevent repeated prompts.\nUse NEMESIS Manager -> Packages -> Package Manager -> Launch after first install.\nOpen Package Manager through NEMESIS Manager after setup.\nCopying a new bundle does not update an already-installed manager.\nUpdate Package Manager through NEMESIS's installer; see docs/UPDATING.md.\nPackage Manager is hidden from its own package list.\nBoth manager UIs share installed packages; finish one operation before starting another.\nRead docs/SETUP-WINDOWS.md for complete steps and warnings.\n"
)
