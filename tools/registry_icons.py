"""Read optional bounded PNG listing artwork without extracting package files.

The complete installer has already passed the shared archive validator before
this module runs. Artwork is independent from executable installer bytes: only
the fixed icon.png member is considered, never a publisher-supplied URL or path.
Its uploaded object is content-addressed and remains private until publication.
"""

import hashlib
import zipfile
from urllib.request import Request, urlopen

from tools.companion_archives import package_layout

from tools.registry_image import validate_png
from tools.registry_png import MAX_ICON


def package_icon(path):
    """Read icon.png beside NEMESIS.data, including a supported ZIP prefix.

    Missing artwork is normal and uses the GitHub-avatar fallback. An oversized
    or malformed supplied icon fails technical validation instead of silently
    publishing different metadata. The member is read in memory within a fixed
    size bound; no archive paths are extracted onto the validator's filesystem.
    """
    with zipfile.ZipFile(path) as archive:
        _, prefix = package_layout(archive)
        name = prefix + "icon.png"
        if name not in archive.namelist():
            return None
        entry = archive.getinfo(name)
        if entry.file_size > MAX_ICON:
            raise ValueError("Package icon exceeds 256 KiB")
        return validate_png(archive.read(entry))


def upload_package_icon(job_url, token, path):
    """Send inspected image bytes only to the authenticated trusted Worker.

    The runner owns job_url, and it carries the same validator capability as
    the ZIP upload. The Worker independently verifies byte size, PNG header,
    dimensions and SHA-256 before storing a private immutable image object.
    A failed image upload prevents the final publication callback. Packages
    without artwork keep the existing upload protocol and incur no image IO.
    """
    raw = package_icon(path)
    if raw is None:
        return
    request = Request(
        job_url + "/icon",
        data=raw,
        method="PUT",
        headers={
            "Authorization": "Bearer " + token,
            "User-Agent": "NEMESIS-Registry-Validator",
            "Content-Type": "image/png",
            "Content-Length": str(len(raw)),
            "X-Checksum-SHA256": hashlib.sha256(raw).hexdigest(),
        },
    )
    with urlopen(request, timeout=60) as response:
        response.read()
