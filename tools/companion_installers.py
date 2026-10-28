"""Inspect raw installer archives without extracting files or inferring versions.

Both descriptor-based packages and loose ZIPs share the internal manifest reader.
A loose archive keeps its original source path and a read-only UI row, because a
file cannot safely serve as a directory-based importer's replacement destination.
Corrupt archives are represented as rows with errors instead of disappearing.
"""

import configparser
import zipfile
from tools.companion_archives import package_layout
from tools.companion_drives import checked_path
from tools.release_metadata import read_config

METADATA_ERRORS = (
    OSError,
    ValueError,
    KeyError,
    configparser.Error,
    zipfile.BadZipFile,
)


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


def describe_zip(root, relative):
    """Keep loose installers visible, including archives with invalid metadata.

    The original ZIP path is displayed rather than pretending it is a managed
    package folder. Validation is identical to an install descriptor's payload.
    """
    result = {
        "folder": relative.removeprefix("packages/"),
        "path": relative,
        "name": relative.rsplit("/", 1)[-1],
        "version": "",
        "kind": "install",
        "error": "",
        "replaceable": False,
    }
    try:
        metadata = package_metadata(checked_path(root, relative))
        result.update(
            {key: metadata.get(key, "") for key in ("id", "version", "description")}
        )
        result["name"] = metadata.get("name") or metadata.get("id") or result["name"]
    except METADATA_ERRORS as error:
        result["error"] = str(error)
    return result
