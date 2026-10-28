#!/bin/sh
# Run from any working directory; keep the terminal open while managing a drive.
cd -- "$(dirname -- "$0")" || exit 1
exec python3 -m tools.usb_companion "$@"
