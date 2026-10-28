#!/usr/bin/env python3
"""Prepare USB root from a built manager bundle and import one or more release archives."""

import argparse
import zipfile
from pathlib import Path
from import_release import import_release, safe_zip


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--usb", type=Path, required=True)
    parser.add_argument(
        "--bundle",
        type=Path,
        required=True,
        help="Built dist/usb-package-manager-ready.zip",
    )
    parser.add_argument(
        "--add",
        type=Path,
        action="append",
        default=[],
        help="Release ZIP to import; repeat as needed",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Update existing release folders while preserving data/",
    )
    args = parser.parse_args()
    usb = args.usb
    usb.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.bundle) as z:
        members = safe_zip(z)
        required = {"NEMESIS.data", "NEMESIS.sh", "manager/usb.package.manager.zip"}
        if not required.issubset(set(z.namelist())):
            raise ValueError("Manager bundle missing required files")
        for m in members:
            target = usb.joinpath(*Path(m.filename).parts)
            if m.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                if target.exists() and not args.overwrite:
                    raise FileExistsError(
                        str(target)
                        + " exists; use --overwrite if you intend to replace the manager launcher"
                    )
                target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(m) as src, target.open("wb") as out:
                    import shutil

                    shutil.copyfileobj(src, out)
    for release in args.add:
        dest, kind = import_release(release, usb, overwrite=args.overwrite)
        print("Imported", kind, "release:", dest)
    print("Prepared USB at", usb)


if __name__ == "__main__":
    main()
