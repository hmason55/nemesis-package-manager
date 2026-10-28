"""Stage validated installers and swap them while preserving user exports.

The existing importer writes into a temporary directory on the selected drive.
Validation finishes before the original installer is moved. User data is moved,
never copied, so large recordings do not require twice their disk space.
These swaps recover from ordinary I/O failures; unplugging media or killing the
process during a swap still requires inspecting the recovery directory.
"""

import os
import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from tools.import_release import import_release
from tools.release_storage import is_data_name
from tools.companion_drives import checked_path
from tools.companion_metadata import describe_package, package_layout


def _no_links(root, path):
    checked_path(root, path.relative_to(root))
    for directory, directories, files in os.walk(path):
        for name in directories + files:
            checked_path(root, (Path(directory) / name).relative_to(root))


def _publish_package(staged, destination, backup):
    """Swap installer directories without copying recordings; roll back failed moves."""
    moved_data = []
    destination.rename(backup)
    try:
        data = [child for child in backup.iterdir() if is_data_name(child.name)]
        if data:
            (staged / "data").rmdir()
        for child in data:
            child.rename(staged / child.name)
            moved_data.append(child.name)
        staged.rename(destination)
    except OSError:
        for name in reversed(moved_data):
            (staged / name).rename(backup / name)
        backup.rename(destination)
        raise


def add_package(root, archive, name, overwrite=False):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", name):
        raise ValueError(
            "Use 1–64 letters, numbers, dots, hyphens or underscores for the folder."
        )
    packages = checked_path(root, "packages")
    packages.mkdir(exist_ok=True)
    destination = checked_path(root, "packages/" + name)
    if destination.exists():
        if not overwrite:
            raise ValueError(
                "That folder exists. Select Replace installer to update it."
            )
        if not destination.is_dir():
            raise ValueError("Package destination is not a directory.")
        _no_links(root, destination)
    # Reject oversized manifests before the shared importer reads them into memory.
    with zipfile.ZipFile(archive) as release:
        package_layout(release)
    work = Path(tempfile.mkdtemp(prefix=".companion-", dir=root))
    try:
        staged, _ = import_release(archive, work, name)
        info = describe_package(work, name)
        if info["error"]:
            raise ValueError(info["error"])
        if destination.exists():
            _publish_package(staged, destination, work / "previous")
        else:
            staged.rename(destination)
    except OSError as error:
        # A second I/O failure during rollback must never clean up the only copy
        # of the user's recordings. Leave both directories for manual recovery.
        if (work / "previous").exists():
            raise OSError(
                f"Drive operation failed. Recovery files were kept at {work}"
            ) from error
        raise
    finally:
        if not (work / "previous").exists() or destination.exists():
            shutil.rmtree(work)
