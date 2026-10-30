"""Anonymous HTTPS registry reads and bounded, verified cloud downloads."""

import json
import re
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from tools.registry_artifact import MAX_DOWNLOAD, validate_artifact


class NoRedirect(HTTPRedirectHandler):
    """The configured Worker is the only authority for API and artifact requests."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Registry requests must not redirect to another host.")


class RegistryClient:
    """Anonymous registry client; all download metadata is treated as untrusted.

    An HTTPS origin is configured by the operator. It cannot delegate downloads
    to unrelated hosts, and neither browser credentials nor GitHub tokens enter
    these requests. Cache revalidation prevents stale approval on installer reuse.
    """

    def __init__(self, base, opener=None):
        """Accept an operator-selected HTTPS endpoint, never embedded credentials."""
        parsed = urlsplit(base)
        if (
            parsed.scheme != "https"
            or not parsed.netloc
            or parsed.username
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Configure an HTTPS registry URL.")
        self.base = base.rstrip("/")
        self.opener = opener or build_opener(NoRedirect())
        self.opener.addheaders = [("User-Agent", "NEMESIS-USB-Companion")]

    def json(self, path):
        """Bound JSON memory use and request fresh approval from intermediaries."""
        with self.opener.open(
            Request(
                self.base + path,
                headers={
                    "Accept": "application/json",
                    "Cache-Control": "no-cache",
                    "User-Agent": "NEMESIS-USB-Companion",
                },
            ),
            timeout=30,
        ) as response:
            raw = response.read(4 * 1024 * 1024 + 1)
            if len(raw) > 4 * 1024 * 1024:
                raise ValueError("Registry response too large.")
            return json.loads(raw)

    def packages(self, query="", category="", page=1):
        """Return one catalog page; consumers choose when to load another page."""
        return self.json(
            "/v1/packages?"
            + urlencode({"q": query, "category": category, "page": page})
        )

    def package(self, package_id):
        """Keep arbitrary package IDs encoded as one URL path segment."""
        return self.json("/v1/packages/" + quote(package_id, safe=""))

    def version(self, package_id, version):
        """Require the exact requested identity and a same-Worker download URL.

        Do not trust a catalog hash or size without validating their shape.
        These bounds are also enforced while streaming, before importing a ZIP.
        Version strings remain literal identities and are encoded in the URL;
        precedence is a separate concern shared with the vehicle application.
        """
        path = (
            "/v1/packages/"
            + quote(package_id, safe="")
            + "/versions/"
            + quote(version, safe="")
        )
        metadata = self.json(path)
        if (
            metadata.get("package_id") != package_id
            or metadata.get("version") != version
            or not re.fullmatch(r"[a-f0-9]{64}", metadata.get("sha256", ""))
            or not isinstance(metadata.get("size"), int)
            or not 0 < metadata["size"] <= MAX_DOWNLOAD
            or metadata.get("download_url") != self.base + path + "/download"
        ):
            raise ValueError("Invalid registry version metadata.")
        return metadata

    def download(self, package_id, version, destination, cancelled, progress):
        """Stream into temporary storage, then verify and recheck moderation.

        The caller owns cleanup and USB publication. Cancellation never writes
        directly to a package directory; only the verified result can be imported.
        """
        metadata = self.version(package_id, version)
        total = 0
        with (
            self.opener.open(metadata["download_url"], timeout=30) as response,
            destination.open("wb") as output,
        ):
            while chunk := response.read(1024 * 256):
                if cancelled():
                    raise ValueError(
                        "Download cancelled; existing USB files were kept."
                    )
                total += len(chunk)
                if total > metadata["size"]:
                    raise ValueError("Download exceeds approved size.")
                output.write(chunk)
                progress(total, metadata["size"])
        validate_artifact(
            destination, package_id, version, metadata["size"], metadata["sha256"]
        )
        # Re-check moderation after a long download before any USB changes.
        current = self.version(package_id, version)
        if current["sha256"] != metadata["sha256"]:
            raise ValueError("Registry approval changed during download.")
        return metadata
