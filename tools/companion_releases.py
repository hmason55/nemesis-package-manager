"""Fetch public release metadata only; downloading/installing remains explicit.

The fixed endpoint includes published development prereleases because the app
uses those versions too. Bound the response and timeout so offline use recovers.
Release links are constructed for this repository, never taken from remote HTML.
"""

import json
import re
from urllib.request import Request, urlopen
from urllib.parse import quote

REPOSITORY = "hmason55/nemesis-package-manager"
RELEASES = f"https://github.com/{REPOSITORY}/releases"


def version_key(value):
    match = re.fullmatch(r"v?(\d+(?:\.\d+)*)(?:-build\.(\d+))?", value or "")
    if not match:
        return None
    parts = [int(p) for p in match[1].split(".")]
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts + [int(match[2] or 0)])


def latest_release():
    """Return the highest comparable published manager release or offline status."""
    try:
        request = Request(
            f"https://api.github.com/repos/{REPOSITORY}/releases?per_page=30",
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "Nemesis-USB-companion",
            },
        )
        with urlopen(request, timeout=4) as response:
            data = response.read(512 * 1024 + 1)
        if len(data) > 512 * 1024:
            raise ValueError("Release response is too large")
        releases = json.loads(data)
        candidates = [
            r
            for r in releases
            if not r.get("draft")
            and version_key(r.get("tag_name"))
            and any(
                a.get("name") == "usb-package-manager-ready.zip"
                for a in r.get("assets", [])
            )
        ]
        if not candidates:
            raise ValueError("No comparable manager release found")
        release = max(candidates, key=lambda r: version_key(r["tag_name"]))
        return {
            "version": release["tag_name"].removeprefix("v"),
            "url": RELEASES + "/tag/" + quote(release["tag_name"], safe=""),
            "prerelease": bool(release.get("prerelease")),
            "error": "",
        }
    except (OSError, ValueError, TypeError, AttributeError):
        return {
            "version": "",
            "url": RELEASES,
            "error": "Could not check releases. USB management is available offline.",
        }
