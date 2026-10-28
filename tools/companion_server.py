"""Serve the browser UI and serialize drive selection and writes.

Only an exact asset allowlist is served; arbitrary local paths are never exposed.
The in-memory selection includes the volume identity so an unmounted Linux path
cannot silently become a write target on the computer's own filesystem.
HTTP/1.0 closes each connection, keeping the synchronous server small and avoiding
idle browser keep-alive connections blocking subsequent requests.
"""

import configparser
import json
import secrets
import zipfile
from http.server import HTTPServer
from tools.companion_transport import CompanionTransport
from pathlib import Path
from urllib.parse import urlsplit

from tools.companion_drives import drive_candidates, drive_root
from tools.companion_metadata import scan_drive
from tools.companion_uploads import UPLOAD_ROUTES, handle_upload

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

    def __init__(self, port=0, usb=None):
        self.usb = drive_root(usb) if usb else None
        self.device = self.usb.stat().st_dev if self.usb else None
        super().__init__(("127.0.0.1", port), CompanionHandler)
        self.token = secrets.token_urlsafe(32)
        self.origin = f"http://127.0.0.1:{self.server_port}"

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


class CompanionHandler(CompanionTransport):
    def do_GET(self):
        """Serve known assets or a fresh scan; return user-readable validation errors.

        API reads require the same session token as writes. HTML and its two
        static assets contain no secret and cannot select or modify a drive.
        """
        path = urlsplit(self.path).path
        if not self.authorized(api=path.startswith("/api/")):
            return
        try:
            if path == "/api/state":
                self.respond(
                    200,
                    {
                        "drives": drive_candidates(),
                        "drive": scan_drive(self.server.selected_root())
                        if self.server.usb
                        else None,
                    },
                )
                return
            assets = {
                "/": ("index.html", "text/html; charset=utf-8"),
                "/app.js": ("app.js", "text/javascript; charset=utf-8"),
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
        Every other allowed POST streams a ZIP through the upload dispatcher.
        """
        if not self.authorized():
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            route = urlsplit(self.path)
            if route.path == "/api/select":
                if not 0 < length <= 8192:
                    raise ValueError("Invalid selection request size.")
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict) or not isinstance(data.get("path"), str):
                    raise ValueError("Supply a drive path.")
                root = drive_root(data["path"])
                state = scan_drive(root)
                self.server.usb = root
                self.server.device = root.stat().st_dev
                self.respond(200, state)
                return
            if route.path not in UPLOAD_ROUTES:
                self.respond(404, {"error": "Not found."})
                return
            self.respond(200, handle_upload(self, route, length))
        except EXPECTED_ERRORS as error:
            self.respond(400, {"error": str(error)})
