"""Validate cloud installer identity without extracting or executing package code."""

import hashlib
import zipfile
from pathlib import Path

from tools.companion_installers import package_metadata
from tools.companion_archives import package_layout
from tools.release_metadata import read_config

MAX_DOWNLOAD = 512 * 1024 * 1024


def validate_artifact(path, package_id, version, expected_size=None, sha256=None):
    """Validate the exact bytes and the internal NEMESIS package manifest.

    Shared importer checks reject unsafe paths, links, and excessive declared
    expansion. Cloud packages additionally require immutable artifact identity,
    portable member uniqueness, a bounded manifest, and readable CRC-checked data.
    No members are extracted and no install hooks run during this inspection.
    """
    path = Path(path)
    size = path.stat().st_size
    if not 0 < size <= MAX_DOWNLOAD or (
        expected_size is not None and size != expected_size
    ):
        raise ValueError("Package size does not match approved registry metadata.")
    with path.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    if sha256 is not None and digest != sha256:
        raise ValueError("Package SHA-256 does not match approved registry metadata.")
    metadata = package_metadata(path)
    with zipfile.ZipFile(path) as archive:
        kind, prefix = package_layout(archive)
        names = [entry.filename.rstrip("/").casefold() for entry in archive.infolist()]
        if len(names) != len(set(names)):
            raise ValueError("Duplicate or case-aliased ZIP members are not supported.")
        manifest = archive.getinfo(prefix + "NEMESIS.data")
        if kind != "pkg" or manifest.file_size > 65536:
            raise ValueError(
                "Cloud packages require a directly installable NEMESIS ZIP."
            )
        cfg = read_config(archive.read(manifest))
        if cfg.get("type", ""):
            raise ValueError("USB descriptors are not cloud installer packages.")
        # Read every member to check CRC and reject truncated/compressed payloads.
        for entry in archive.infolist():
            with archive.open(entry) as content:
                while content.read(256 * 1024):
                    pass
    if metadata["id"] != package_id or metadata["version"] != version:
        raise ValueError("Installer ID or version does not match registry metadata.")
    return {
        "package_id": package_id,
        "version": version,
        "sha256": digest,
        "size": size,
    }
