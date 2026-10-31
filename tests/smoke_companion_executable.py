"""Check that a packaged executable serves its bundled UI and authenticated API."""

import http.client
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit


def smoke(executable):
    with tempfile.TemporaryDirectory() as work:
        log = Path(work) / "startup.log"
        with log.open("wb") as output:
            environment = os.environ.copy()
            environment.pop("NEMESIS_REGISTRY_URL", None)
            process = subprocess.Popen(
                [str(Path(executable).resolve()), "--no-browser"],
                stdout=output,
                stderr=output,
                env=environment,
            )
            try:
                deadline = time.monotonic() + 20
                while time.monotonic() < deadline:
                    match = re.search(
                        r"http://127\.0\.0\.1:\d+/#\S+", log.read_text(errors="replace")
                    )
                    if match:
                        break
                    if process.poll() is not None:
                        raise RuntimeError(
                            "Executable exited before serving its UI: "
                            + log.read_text(errors="replace")
                        )
                    time.sleep(0.1)
                else:
                    raise RuntimeError(
                        "Executable did not print its local URL within 20 seconds."
                    )
                url = urlsplit(match[0])
                for path, expected in (
                    ("/", b"USB companion"),
                    ("/app.js", b"X-Companion-Token"),
                    ("/cloud.js", b"/api/cloud/start"),
                    ("/style.css", b":root"),
                    ("/api/state", b"drives"),
                    (
                        "/api/cloud/config",
                        b"https://nemesis-registry-staging.hmason55.workers.dev",
                    ),
                ):
                    connection = http.client.HTTPConnection(
                        url.hostname, url.port, timeout=5
                    )
                    connection.request(
                        "GET", path, headers={"X-Companion-Token": url.fragment}
                    )
                    response = connection.getresponse()
                    body = response.read()
                    connection.close()
                    if response.status != 200 or expected not in body:
                        raise RuntimeError("Packaged resource failed: " + path)
                    if path == "/api/state" and json.loads(body)["drive"] is not None:
                        raise RuntimeError(
                            "Fresh executable unexpectedly selected a drive."
                        )
                print("Packaged executable serves UI assets and authenticated API.")
            finally:
                if sys.platform == "win32":
                    # A one-file Windows app has a bootloader parent and a child.
                    # Stop our own process tree so the HTTP server is not orphaned.
                    subprocess.run(
                        ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        check=False,
                    )
                else:
                    process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == "__main__":
    smoke(sys.argv[1])
