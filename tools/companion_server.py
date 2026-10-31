"""Serve the browser UI and serialize drive selection and writes.

Only an exact asset allowlist is served; arbitrary local paths are never exposed.
The in-memory selection includes the volume identity so an unmounted Linux path
cannot silently become a write target on the computer's own filesystem.
HTTP/1.0 closes each connection, keeping the synchronous server small and avoiding
idle browser keep-alive connections blocking subsequent requests.
"""

import configparser
import secrets
import threading
import zipfile
from http.server import HTTPServer
from tools.companion_transport import CompanionTransport
from pathlib import Path
from urllib.parse import urlsplit

from tools.companion_drives import drive_candidates, drive_root
from tools.companion_metadata import scan_drive
from tools.companion_mutations import mutate
from tools.companion_releases import latest_release
from tools.companion_cloud_http import cloud_get, cloud_post
from tools.companion_cloud import CloudJobs
from tools.registry_client import configured_registry_url

ASSETS = Path(__file__).with_name("companion_ui")
EXPECTED_ERRORS = (
    OSError,
    ValueError,
    KeyError,
    configparser.Error,
    zipfile.BadZipFile,
)


class CompanionServer(HTTPServer):
    """Serialize drive operations so imports and selection cannot race each other."""

    def __init__(self, port=0, usb=None, registry_url=None):
        self.drive_lock = threading.RLock()
        self.usb = drive_root(usb) if usb else None
        self.device = self.usb.stat().st_dev if self.usb else None
        super().__init__(("127.0.0.1", port), CompanionHandler)
        self.token = secrets.token_urlsafe(32)
        self.selection_id = secrets.token_urlsafe(24)
        self.origin = f"http://127.0.0.1:{self.server_port}"
        self.cloud = CloudJobs(self, configured_registry_url(registry_url))

    def selected_root(self):
        """Revalidate selection before writes, including after a long upload."""
        if not self.usb:
            raise ValueError("Select a drive first.")
        root = drive_root(self.usb)
        if root.stat().st_dev != self.device:
            raise ValueError("Drive changed or disconnected. Select it again.")
        return root

    @property
    def url(self):
        return self.origin + "/#" + self.token

    def drive_state(self):
        """Return a scan bound to the current selection generation.

        This opaque ID is separate from session authentication. A tab retains
        the ID for the drive it displayed until it explicitly refreshes.
        """
        state = scan_drive(self.selected_root())
        state["selection_id"] = self.selection_id
        return state

    def bound_root(self, selection_id):
        """Fail closed when a tab confirms an obsolete drive selection.

        Require the binding for every upload, including older clients. The
        filesystem identity check still runs before any files are published.
        """
        if not selection_id or selection_id != self.selection_id:
            raise ValueError(
                "Drive selection changed in another tab. Refresh and select your drive again."
            )
        return self.selected_root()


class CompanionHandler(CompanionTransport):
    def do_GET(self):
        """Serve known assets or a fresh scan; return user-readable validation errors.

        API reads require the same session token as writes. HTML and its two
        static assets contain no secret and cannot select or modify a drive.
        The release endpoint fetches metadata from a fixed public repository;
        executable downloads remain explicit browser actions.
        """
        path = urlsplit(self.path).path
        if not self.authorized(api=path.startswith("/api/")):
            return
        try:
            if cloud_get(self, urlsplit(self.path)):
                return
            if path == "/api/manager-release":
                self.respond(200, latest_release())
                return
            if path == "/api/state":
                self.respond(
                    200,
                    {
                        "drives": drive_candidates(),
                        "drive": self.server.drive_state() if self.server.usb else None,
                    },
                )
                return
            assets = {
                "/": ("index.html", "text/html; charset=utf-8"),
                "/app.js": ("app.js", "text/javascript; charset=utf-8"),
                "/cloud.js": ("cloud.js", "text/javascript; charset=utf-8"),
                "/cloud-search.js": (
                    "cloud-search.js",
                    "text/javascript; charset=utf-8",
                ),
                "/style.css": ("style.css", "text/css; charset=utf-8"),
            }
            if path not in assets:
                self.respond(404, {"error": "Not found."})
                return
            filename, content_type = assets[path]
            self.respond(200, (ASSETS / filename).read_bytes(), content_type)
        except EXPECTED_ERRORS as error:
            self.respond(400, {"error": str(error)})

    def do_POST(self):
        """Authenticate before reading uploads or changing the selected drive.

        Selection is committed only after the new path scans successfully.
        Bounded JSON control actions use the same drive-generation binding as
        imports, before reading their bodies. The three upload routes stream ZIPs
        through the upload dispatcher; no action executes head-unit code here.
        A single server thread keeps drive mutations serialized with imports.
        """
        if not self.authorized():
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            route = urlsplit(self.path)
            if cloud_post(self, route, length):
                return
            if not mutate(self, route, length):
                self.respond(404, {"error": "Not found."})
        except EXPECTED_ERRORS as error:
            self.respond(400, {"error": str(error)})
