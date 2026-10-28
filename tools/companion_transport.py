"""HTTP response policy and session authentication for the local UI.

The random secret travels in a URL fragment and then in a request header, so
ordinary web pages cannot submit drive operations through forms. Origin and Host
checks also reject cross-origin requests and DNS rebinding. There is no CORS
permission, external asset loading, persistent credential, or remote listener.
The terminal intentionally stays open for the lifetime of the local server.
"""

import hmac
import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlsplit


class CompanionTransport(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(60)

    def log_message(self, *_):
        pass  # Do not print session credentials or uploaded filenames.

    def respond(self, status, body, content_type="application/json"):
        if content_type == "application/json":
            body = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        )
        self.end_headers()
        self.wfile.write(body)

    def authorized(self, api=True):
        if self.headers.get("Host") != urlsplit(self.server.origin).netloc:
            self.respond(403, {"error": "Unrecognized host."})
            return False
        origin = self.headers.get("Origin")
        if origin and origin != self.server.origin:
            self.respond(403, {"error": "Requests must come from the companion page."})
            return False
        if api and not hmac.compare_digest(
            self.headers.get("X-Companion-Token", ""), self.server.token
        ):
            self.respond(
                403, {"error": "Open the full session URL printed by the companion."}
            )
            return False
        return True
