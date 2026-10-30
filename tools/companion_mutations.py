"""Serialize local USB mutations with background cloud publication.

The HTTP handler authenticates the request before calling this dispatcher.
One drive lock covers selection, deletion, launcher changes, and imports so a
verified cloud download cannot publish into a concurrently changing USB tree.
Network downloads happen outside this lock in the cloud job worker.
"""

import json
import secrets

from tools.companion_actions import handle_action
from tools.companion_drives import drive_root
from tools.companion_metadata import scan_drive
from tools.companion_uploads import UPLOAD_ROUTES, handle_upload


def select_drive(handler, length):
    """Scan before committing a new selection and its generation capability."""
    if not 0 < length <= 8192:
        raise ValueError("Invalid request size.")
    data = json.loads(handler.rfile.read(length))
    if not isinstance(data, dict) or not isinstance(data.get("path"), str):
        raise ValueError("Supply a drive path.")
    root = drive_root(data["path"])
    state = scan_drive(root)
    handler.server.usb = root
    handler.server.device = root.stat().st_dev
    handler.server.selection_id = secrets.token_urlsafe(24)
    state["selection_id"] = handler.server.selection_id
    return state


def mutate(handler, route, length):
    """Handle an allowed local route; leave unknown routes to the HTTP handler."""
    controls = ("/api/remove", "/api/launcher")
    if route.path not in (*controls, "/api/select", *UPLOAD_ROUTES):
        return False
    with handler.server.drive_lock:
        if route.path in controls:
            result = handle_action(handler, route.path, length)
        elif route.path == "/api/select":
            result = select_drive(handler, length)
        else:
            result = handle_upload(handler, route, length)
    handler.respond(200, result)
    return True
