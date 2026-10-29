"""Verify the actual APK and bind its metadata/signature to the release bundles."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.apk_verification import verify_apk
from tools.release_metadata import read_config


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_bundles(apk_data, directory, version):
    """Bind the nested installer and USB bundle to the APK just verified.

    Compare bytes, not filenames: stale or substituted archives must not inherit
    another APK's certificate evidence. Hashes cover the complete resulting ZIPs.
    """
    installer = directory / "usb.package.manager.zip"
    ready = directory / "usb-package-manager-ready.zip"
    with zipfile.ZipFile(installer) as archive:
        if archive.read("app/UsbPackageManager.apk") != apk_data:
            raise ValueError(
                "Installer contains an APK different from the verified APK"
            )
        manifest = read_config(archive.read("NEMESIS.data"))
        if (
            manifest.get("version") != version
            or manifest.get("id") != "usb.package.manager"
        ):
            raise ValueError("NEMESIS manifest version does not match the release")
    with zipfile.ZipFile(ready) as archive:
        if archive.read("manager/usb.package.manager.zip") != installer.read_bytes():
            raise ValueError("USB bundle contains a different manager installer")
    return {p.name: digest(p.read_bytes()) for p in (installer, ready)}


def evidence(
    apk, directory, sdk, source_sha, version, version_code, channel, expected=""
):
    """Produce public provenance only after every artifact verification succeeds.

    Tool failures propagate, so no new success receipt is written after a failed
    signature or metadata check. Private signing material never enters this data.
    """
    if not re.fullmatch(r"[a-f0-9]{40}", source_sha):
        raise ValueError("An exact source commit is required")
    if channel not in ("development", "stable"):
        raise ValueError("Unknown release channel")
    fingerprint = verify_apk(apk, sdk, version, version_code, channel, expected)
    apk_data = apk.read_bytes()
    return {
        "schema": 1,
        "source_sha": source_sha,
        "version": version,
        "version_code": int(version_code),
        "channel": channel,
        "signing": "release" if channel == "stable" else "debug",
        "certificate_sha256": fingerprint,
        "apk_sha256": digest(apk_data),
        "assets": verify_bundles(apk_data, directory, version),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("apk", "directory", "sdk"):
        parser.add_argument("--" + option, type=Path, required=True)
    for option in ("source-sha", "version", "version-code", "channel"):
        parser.add_argument("--" + option, required=True)
    parser.add_argument("--expected-fingerprint", default="")
    args = parser.parse_args()
    report = evidence(
        args.apk,
        args.directory,
        args.sdk,
        args.source_sha,
        args.version,
        args.version_code,
        args.channel,
        args.expected_fingerprint,
    )
    (args.directory / "release-evidence.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print("Verified APK identity, v1 signature, versions, and nested bundles.")
