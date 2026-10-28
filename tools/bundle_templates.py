"""USB launcher and package descriptors kept separate from archive construction."""

PACKAGE_MANIFEST = """[nemesis]
version=0.2.0
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
