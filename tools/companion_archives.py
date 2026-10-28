"""Apply bounded, portable archive validation before invoking the shared importer.

Windows treats trailing dots/spaces and DOS device names differently from Linux.
Reject these aliases on both platforms so a release has one interpretation and
cannot escape a staging directory through an alias for its parent directory.
The shared checks reject traversal and symlinks and cap archive expansion.
Manifests have a smaller limit because the layout detector reads them into RAM.
"""

import re

from tools.archive_safety import safe_zip
from tools.release_metadata import detect


def package_layout(archive):
    """Validate every member before the detector reads any manifest content."""
    for member in safe_zip(archive):
        for part in filter(None, member.filename.split("/")):
            device = re.fullmatch(
                r"(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", part
            )
            if part != part.rstrip(" .") or device:
                raise ValueError("Nonportable archive path: " + member.filename)
        if member.filename.endswith("NEMESIS.data") and member.file_size > 1024 * 1024:
            raise ValueError("Package manifest is too large.")
    return detect(archive)
