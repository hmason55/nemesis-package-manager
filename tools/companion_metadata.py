"""Read installer metadata without confusing USB protocol and app versions.

A USB descriptor's version belongs to the descriptor format. Installer versions
must come from the internal package manifest, including archives with one enclosing
directory. Execute scripts can supply names and descriptions; their protocol
version stays separate so the UI says Unknown instead of guessing app versions.
"""

import shutil
from tools.companion_identity import validate_package_id
from tools.release_metadata import read_config
from tools.companion_drives import checked_path
from tools.companion_scan import package_locations

from tools.companion_installers import (
    METADATA_ERRORS,
    describe_zip,
    package_metadata,
)


def describe_package(root, folder):
    """Return one display row even when a package is broken.

    Broken packages should not hide the healthy packages on the same drive.
    Resolve descriptor paths under the selected root before inspecting payloads.
    """
    result = {
        "folder": folder,
        "name": folder,
        "version": "",
        "kind": "",
        "error": "",
        "path": f"packages/{folder}/",
        "replaceable": True,
    }
    try:
        directory = checked_path(root, "packages/" + folder)
        descriptor = checked_path(root, directory.relative_to(root) / "NEMESIS.data")
        if descriptor.stat().st_size > 1024 * 1024:
            raise ValueError("Package manifest is too large.")
        cfg = read_config(descriptor.read_bytes())
        result["kind"] = cfg.get("type", "source")
        if result["kind"] in ("install", "execute"):
            value = cfg.get("path", "")
            if not value or "\\" in value or ":" in value:
                raise ValueError("Missing or invalid descriptor path.")
            payload = checked_path(root, directory.relative_to(root) / value)
            if not payload.is_file():
                raise ValueError("Referenced installer or script is missing.")
            # Execute descriptors identify the USB protocol, not a package version.
            metadata = (
                package_metadata(payload)
                if result["kind"] == "install"
                else {**cfg, "version": ""}
            )
        elif cfg.get("id"):
            metadata = dict(cfg)
        else:
            raise ValueError("Unrecognized package descriptor.")
        if result["kind"] != "execute" or metadata.get("id"):
            validate_package_id(metadata.get("id", ""))
        result.update(
            {key: metadata.get(key, "") for key in ("id", "version", "description")}
        )
        result["name"] = metadata.get("name") or metadata.get("id") or folder
    except METADATA_ERRORS as error:
        result["error"] = str(error)
    return result


def scan_drive(root):
    """Report drive contents, never infer what is installed in the vehicle.

    Missing or invalid manager metadata is returned as an actionable status.
    Free space comes from the filesystem rather than an estimate of ZIP sizes.
    """
    usage = shutil.disk_usage(root)
    manager = {"version": "", "error": "", "present": False}
    try:
        payload = checked_path(root, "manager/usb.package.manager.zip")
        manager["present"] = payload.is_file()
        if manager["present"]:
            manager.update(package_metadata(payload))
    except METADATA_ERRORS as error:
        manager["error"] = str(error)
    active = checked_path(root, "NEMESIS.data").exists()
    manager["repairable"] = (
        active
        or checked_path(root, "NEMESIS.sh").exists()
        or any(
            checked_path(root, path.name).exists()
            for path in root.glob("NEMESIS.data.disabled*")
        )
    )
    return {
        "path": str(root),
        "free": usage.free,
        "total": usage.total,
        "manager": manager,
        "launcher": "Active" if active else "Disabled or absent",
        "packages": [
            describe_package(root, path.removeprefix("packages/"))
            if descriptor
            else describe_zip(root, path)
            for path, descriptor in package_locations(root)
        ],
    }
