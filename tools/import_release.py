#!/usr/bin/env python3
"""Organize NEMESIS release ZIPs into packages/<slug>/ on USB without touching root NEMESIS.data."""

try:
    from tools.archive_safety import safe_zip
except ModuleNotFoundError:
    from archive_safety import safe_zip

try:
    from tools.release_storage import is_data_name, clear_installers, copy_usb
except ModuleNotFoundError:
    from release_storage import is_data_name, clear_installers, copy_usb

import argparse
import re
import shutil
import zipfile
from pathlib import Path

try:
    from tools.release_metadata import read_config, detect
except ModuleNotFoundError:
    from release_metadata import read_config, detect


MAX_ENTRIES = 20000
MAX_UNCOMPRESSED = 3 * 1024**3


def import_release(source, usb, name=None, overwrite=False):
    """Import one validated release without changing the USB root descriptor.

    Inspect the archive before replacing any old installer files. Preserve raw
    internal package ZIPs as shipped; USB bundles are copied into a release-local
    directory. User-owned data is outside the replacement set in both cases.
    """
    if not source.is_file() or source.suffix.lower() != ".zip":
        raise ValueError("source must be a ZIP release archive")
    slug = name or (
        source.stem[:-4] if source.stem.endswith("-usb") else source.stem
    ).replace(" ", "-")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", slug):
        raise ValueError("invalid package folder name")
    root = usb / "packages"
    dst = root / slug
    if dst.exists() and not overwrite:
        raise FileExistsError(f"{dst} exists. Use a new folder name (or --overwrite).")
    # Never delete a pre-existing data/ directory during release updates.
    root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as z:
        members = safe_zip(z)
        kind, prefix = detect(z)
        if dst.exists() and overwrite:
            clear_installers(dst)
        dst.mkdir(exist_ok=True)
        if kind == "pkg":
            # Preserve the release ZIP as-is: NEMESIS supports one enclosing package directory.
            shutil.copy2(source, dst / "payload.zip")
            (dst / "NEMESIS.data").write_text(
                "[nemesis]\nversion=1.0\ntype=install\npath=payload.zip\n"
            )
        else:
            copy_usb(z, members, prefix, dst)
        (dst / "data").mkdir(exist_ok=True)
    return dst, kind


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("release_zip", type=Path)
    ap.add_argument(
        "--usb", required=True, type=Path, help="USB root, e.g. E:\\ or /media/USB"
    )
    ap.add_argument("--name", help="Folder name shown in manager")
    ap.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace installer files but preserve data/",
    )
    args = ap.parse_args()
    dest, kind = import_release(args.release_zip, args.usb, args.name, args.overwrite)
    print(f"Imported {kind} release to {dest}")
