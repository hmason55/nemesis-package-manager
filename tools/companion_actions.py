"""Explicit USB-only actions, scoped to the selected volume and known rows.

Removal never uninstalls the head-unit app. Validate the complete tree before
moving or deleting it; data aliases are retained unless explicitly requested.
Staging a folder on the same volume keeps recordings available during cleanup.
"""

import json
import tempfile
from tools.companion_launcher import set_launcher
import shutil
from pathlib import Path
from tools.companion_drives import checked_path
from tools.companion_scan import package_locations
from tools.companion_packages import _no_links
from tools.release_storage import is_data_name


def remove_package(root, relative, delete_data=False):
    """Remove a visible installer, optionally including its own data directory."""
    if not isinstance(delete_data, bool):
        raise ValueError("Choose whether to delete data.")
    if not isinstance(relative, str):
        raise ValueError("Choose a package path.")
    rows = dict(package_locations(root))
    if relative not in rows:
        raise ValueError(
            "Package changed or is no longer on this drive. Refresh first."
        )
    target = checked_path(root, relative)
    if not rows[relative]:
        # Loose ZIPs may share a parent with other installers and their data.
        if delete_data:
            raise ValueError("Shared data for loose installers must be kept.")
        target.unlink()
        return
    _no_links(root, target)
    work = Path(tempfile.mkdtemp(prefix=".companion-remove-", dir=root))
    previous = work / "package"
    try:
        target.rename(previous)
        if not delete_data:
            target.mkdir()
            for child in previous.iterdir():
                if is_data_name(child.name):
                    child.rename(target / child.name)
        # Recheck the resolved deletion target before recursive removal.
        checked_path(root, previous.relative_to(root))
        shutil.rmtree(previous)
    except OSError as error:
        raise OSError(
            f"Removal incomplete. Keep recovery files at {work}: {error}"
        ) from error
    finally:
        if not previous.exists():
            work.rmdir()


def handle_action(handler, route, length):
    """Authenticate the drive binding before accepting bounded JSON action options.

    The single server thread serializes these actions with imports. A stale tab
    cannot delete from a newly selected drive or change that drive's launcher.
    """
    root = handler.server.bound_root(handler.headers.get("X-Companion-Drive", ""))
    if not 0 < length <= 8192:
        raise ValueError("Invalid request size.")
    data = json.loads(handler.rfile.read(length))
    if not isinstance(data, dict):
        raise ValueError("Supply action options.")
    if route == "/api/remove":
        remove_package(root, data.get("path"), data.get("delete_data"))
    else:
        set_launcher(root, data.get("enabled"))
    return handler.server.drive_state()
