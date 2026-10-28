"""Read installer metadata without confusing USB protocol and app versions.

A USB descriptor's version belongs to the descriptor format. Installer versions
must come from the internal package manifest, including archives with one enclosing
directory. Execute scripts can supply names and descriptions; their protocol
version stays separate so the UI says Unknown instead of guessing app versions.
"""

import configparser
import shutil
import zipfile
from tools.companion_archives import package_layout
from tools.release_metadata import read_config
from tools.companion_drives import checked_path


def package_metadata(payload):
    """Inspect only the manifest; never extract or execute the installer.

    The archive safety checks also bound entry count and expanded size. The
    manifest has a smaller limit because it is read into memory for parsing.
    """
    with zipfile.ZipFile(payload) as archive:
        kind, prefix = package_layout(archive)
        if kind != "pkg":
            raise ValueError(
                "Installer ZIP does not contain an internal package manifest."
            )
        member = archive.getinfo(prefix + "NEMESIS.data")
        cfg = read_config(archive.read(member))
        return {
            key: cfg.get(key, "") for key in ("id", "name", "version", "description")
        }


def describe_package(root, folder):
    """Return one display row even when a package is broken.

    Broken packages should not hide the healthy packages on the same drive.
    Resolve descriptor paths under the selected root before inspecting payloads.
    """
    result = {"folder": folder, "name": folder, "version": "", "kind": "", "error": ""}
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
        result.update(
            {key: metadata.get(key, "") for key in ("id", "version", "description")}
        )
        result["name"] = metadata.get("name") or metadata.get("id") or folder
    except (
        OSError,
        ValueError,
        KeyError,
        configparser.Error,
        zipfile.BadZipFile,
    ) as error:
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
    except (
        OSError,
        ValueError,
        KeyError,
        configparser.Error,
        zipfile.BadZipFile,
    ) as error:
        manager["error"] = str(error)
    packages = checked_path(root, "packages")
    entries = (
        sorted(packages.iterdir(), key=lambda p: p.name.casefold())
        if packages.is_dir()
        else []
    )
    active = checked_path(root, "NEMESIS.data").exists()
    return {
        "path": str(root),
        "free": usage.free,
        "total": usage.total,
        "manager": manager,
        "launcher": "Active" if active else "Disabled or absent",
        "packages": [describe_package(root, p.name) for p in entries if p.is_dir()],
    }
