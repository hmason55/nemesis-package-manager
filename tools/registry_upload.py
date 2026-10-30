"""Upload large verified ZIPs without exceeding Cloudflare request-body limits.

The trusted runner has already checked the complete artifact digest. Each
8 MiB part additionally carries a checksum verified by the Worker before R2
accepts it. The global registry digest remains the runner's hash of the original
file, never a multipart ETag. Partial uploads remain private and are aborted on
ordinary failures; the Worker also cleans abandoned upload state on its schedule.
"""

import hashlib
from urllib.request import Request, urlopen


def upload_large(job_url, token, archive, result, request_json):
    """Stream bounded parts, then ask R2 to assemble the approved candidate.

    No R2 credentials or presigned bucket URLs are needed. All requests target
    the configured registry, use the validator capability, and carry the active
    upload ID so an obsolete transfer cannot modify a replacement upload.
    """
    endpoint = job_url + "/multipart"
    state = request_json(
        endpoint + "/start", token, {"sha256": result["sha256"], "size": result["size"]}
    )
    headers = {
        "User-Agent": "NEMESIS-Registry-Validator",
        "Authorization": "Bearer " + token,
        "X-Upload-ID": state["upload_id"],
    }
    try:
        with archive.open("rb") as source:
            number = 0
            while chunk := source.read(8 * 1024 * 1024):
                number += 1
                request = Request(
                    endpoint + "/part/" + str(number),
                    data=chunk,
                    method="PUT",
                    headers={
                        **headers,
                        "Content-Length": str(len(chunk)),
                        "X-Checksum-SHA256": hashlib.sha256(chunk).hexdigest(),
                    },
                )
                with urlopen(request, timeout=120) as response:
                    response.read()
        request = Request(
            endpoint + "/complete",
            data=b"{}",
            headers={**headers, "Content-Type": "application/json"},
        )
        with urlopen(request, timeout=120) as response:
            response.read()
    except Exception:
        # Aborting preserves the original exception if cleanup also fails.
        try:
            with urlopen(
                Request(endpoint + "/abort", data=b"{}", headers=headers), timeout=30
            ) as response:
                response.read()
        except OSError:
            pass
        raise
