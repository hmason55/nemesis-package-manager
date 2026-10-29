"""Stream browser uploads to disk and dispatch validated drive operations.

The server processes one request at a time. Uploaded bytes use a bounded buffer,
not a copy of the complete archive in memory. A short or oversized upload fails
before any USB files are touched, and its temporary file is always removed.
Drive identity is checked again after upload in case media was removed meanwhile.
"""

import tempfile
from pathlib import Path
from urllib.parse import parse_qs

from tools.companion_manager import setup_manager
from tools.companion_packages import add_package

MAX_UPLOAD = 512 * 1024 * 1024
UPLOAD_ROUTES = ("/api/package", "/api/setup", "/api/update-manager")


def receive_file(stream, output, length):
    """Read exactly Content-Length bytes, failing closed on an interrupted upload."""
    remaining = length
    while remaining:
        chunk = stream.read(min(1024 * 1024, remaining))
        if not chunk:
            raise ValueError("Upload interrupted; no drive files were changed.")
        output.write(chunk)
        remaining -= len(chunk)


def handle_upload(handler, route, length):
    selection_id = handler.headers.get("X-Companion-Drive", "")
    handler.server.bound_root(selection_id)
    if not 0 < length <= MAX_UPLOAD:
        raise ValueError("Select a ZIP smaller than 512 MiB.")
    options = parse_qs(route.query)
    with tempfile.TemporaryDirectory(prefix="nemesis-upload-") as work:
        upload = Path(work) / "release.zip"
        with upload.open("wb") as output:
            receive_file(handler.rfile, output, length)
        root = handler.server.bound_root(selection_id)
        if route.path == "/api/package":
            add_package(
                root,
                upload,
                options.get("name", [""])[0],
                options.get("overwrite", ["false"])[0] == "true",
            )
        else:
            setup_manager(root, upload, update=route.path == "/api/update-manager")
    return handler.server.drive_state()
