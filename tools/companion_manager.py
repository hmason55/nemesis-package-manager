"""Prepare launcher files once; update only the manager installer afterward.

Reactivating a disabled root descriptor would bring back startup prompts.
First setup therefore refuses existing launcher files and disabled backups.
Both operations validate a staged internal manifest before publishing anything.
The update uses a same-filesystem replace so the old installer remains intact
until the new file is ready. No head-unit code is executed on the computer.
"""

import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from tools.companion_archives import package_layout
from tools.companion_drives import checked_path
from tools.companion_metadata import package_metadata


def setup_manager(root, bundle, update=False):
    """First setup copies launcher files; updates only replace the manager payload."""
    required = ("NEMESIS.data", "NEMESIS.sh", "manager/usb.package.manager.zip")
    with zipfile.ZipFile(bundle) as archive:
        if not set(required).issubset(archive.namelist()):
            raise ValueError(
                "Select usb-package-manager-ready.zip from a manager release."
            )
        package_layout(archive)
        targets = required[2:] if update else required
        for name in targets:
            target = checked_path(root, name)
            if not update and target.exists():
                raise ValueError(
                    "Setup files already exist. Use Update manager instead."
                )
        if not update and list(root.glob("NEMESIS.data.disabled*")):
            raise ValueError(
                "This drive has a disabled launcher. Use Update manager instead."
            )
        with tempfile.TemporaryDirectory(prefix=".companion-", dir=root) as work:
            work = Path(work)
            for name in targets:
                staged = work / name
                staged.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(name) as source, staged.open("wb") as output:
                    shutil.copyfileobj(source, output)
            metadata = package_metadata(work / required[2])
            if metadata["id"] != "usb.package.manager":
                raise ValueError("Bundle does not contain Package Manager.")
            if update:
                target = checked_path(root, required[2])
                target.parent.mkdir(exist_ok=True)
                os.replace(work / required[2], target)
            else:
                published = []
                try:
                    for name in targets:
                        target = checked_path(root, name)
                        target.parent.mkdir(exist_ok=True)
                        # Exclusive creation also prevents replacing a newly appeared file.
                        with target.open("xb") as output:
                            published.append(target)
                            with (work / name).open("rb") as source:
                                shutil.copyfileobj(source, output)
                except OSError:
                    for target in published:
                        target.unlink(missing_ok=True)
                    raise
