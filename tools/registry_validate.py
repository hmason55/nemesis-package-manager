"""Trusted Actions runner: inspect GitHub bytes without running publisher code.

The Worker claims the submission before any download. This process reads a
public release and exact asset ID, validates the complete ZIP, then uploads the
same bytes to private R2. Publication always remains an administrator decision.
"""

import argparse
import json
import os
import re
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

from tools.registry_artifact import MAX_DOWNLOAD, validate_artifact
from tools.registry_upload import upload_large


def request_json(url, token, data):
    """Use the validator credential only for requests to the configured Worker."""
    request = Request(
        url,
        data=json.dumps(data).encode(),
        headers={
            "User-Agent": "NEMESIS-Registry-Validator",
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
        },
    )
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def release_asset(job):
    """Resolve a selected public release asset; never check out repository code."""
    repo = job["repository"]
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+", repo):
        raise ValueError("Invalid repository")
    url = f"https://api.github.com/repos/{repo}/releases/{int(job['release_id'])}"
    headers = {
        "User-Agent": "NEMESIS-Registry",
        "Accept": "application/vnd.github+json",
    }
    github_token = os.environ.get("GITHUB_TOKEN")
    if github_token:
        headers["Authorization"] = "Bearer " + github_token
    with urlopen(Request(url, headers=headers), timeout=60) as response:
        release = json.load(response)
    asset = next(a for a in release["assets"] if a["id"] == job["asset_id"])
    if (
        release["draft"]
        or not asset["name"].lower().endswith(".zip")
        or not 0 < asset["size"] <= MAX_DOWNLOAD
    ):
        raise ValueError("Release asset is not an eligible installer")
    if not asset["browser_download_url"].startswith(
        f"https://github.com/{repo}/releases/download/"
    ):
        raise ValueError("Unexpected release download URL")
    return asset


def download_asset(asset, archive):
    """Bound download size and send no credentials to GitHub binary redirects."""
    with (
        urlopen(asset["browser_download_url"], timeout=60) as source,
        archive.open("wb") as output,
    ):
        total = 0
        while chunk := source.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_DOWNLOAD:
                raise ValueError("Package exceeds download limit")
            output.write(chunk)


def upload_artifact(job_url, token, archive, result):
    """Stream the verified file; R2 also enforces its supplied SHA-256 checksum.

    Content-Length comes from the inspected file, not user metadata. The Worker
    keeps this object private until a separate moderation transition approves it.
    """
    if result["size"] > 64 * 1024 * 1024:
        return upload_large(job_url, token, archive, result, request_json)
    with archive.open("rb") as source:
        request = Request(
            job_url + "/artifact",
            data=source,
            method="PUT",
            headers={
                "User-Agent": "NEMESIS-Registry-Validator",
                "Authorization": "Bearer " + token,
                "Content-Type": "application/zip",
                "Content-Length": str(result["size"]),
                "X-Checksum-SHA256": result["sha256"],
            },
        )
        with urlopen(request, timeout=600) as response:
            response.read()


def validate_job(base, token, job_id):
    """Claim once, validate, and leave either a reviewable artifact or a failure.

    Claim conflicts return before any work or failure callback, so a duplicate
    Actions dispatch cannot fail another runner's active job. A successful claim
    owns the transition from validating to review. Backend timeouts make a lost
    runner visible to administrators rather than leaving an invisible lease.

    The runner receives only IDs, never publisher-controlled commands or paths.
    Its checkout is trusted main, the temporary filename is fixed, and the final
    artifact is addressed by content hash. Inspecting a package cannot run its
    hooks or replace code used by the validator itself.
    """
    if not base.startswith("https://") or not re.fullmatch(r"[a-f0-9]{64}", job_id):
        raise ValueError("Invalid registry URL or submission ID")
    job_url = base.rstrip("/") + "/internal/jobs/" + job_id
    job = request_json(job_url + "/claim", token, {})
    try:
        asset = release_asset(job)
        with tempfile.TemporaryDirectory(prefix="nemesis-validation-") as directory:
            archive = Path(directory) / "package.zip"
            download_asset(asset, archive)
            result = validate_artifact(
                archive, job["package_id"], job["version"], asset["size"]
            )
            upload_artifact(job_url, token, archive, result)
            request_json(job_url + "/complete", token, result)
    except Exception:
        # Do not persist signed URLs, credentials, or third-party error bodies.
        request_json(
            job_url + "/fail",
            token,
            {
                "reason": "Release download, archive validation, or upload failed. Inspect the trusted workflow result."
            },
        )
        raise RuntimeError("Package validation failed") from None


def main():
    """Read credentials from the Actions environment, never command arguments."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("submission_id")
    args = parser.parse_args()
    validate_job(
        os.environ["REGISTRY_API_URL"],
        os.environ["REGISTRY_VALIDATOR_TOKEN"],
        args.submission_id,
    )


if __name__ == "__main__":
    main()
