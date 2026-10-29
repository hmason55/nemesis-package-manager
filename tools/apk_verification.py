"""Check Android identity and compatibility with the SDK's cryptographic tools.

Bundle structure alone cannot establish signing identity. These checks inspect
what Android will install before provenance is attached to compressed downloads.
"""

import os
import re
import subprocess


def certificate(signature, channel, expected):
    """Require one certificate and the JAR signature understood by API 19.

    For stable artifacts the public expected fingerprint is the trust anchor;
    merely reporting the certificate found in an APK would not establish identity.
    """
    if "Verified using v1 scheme (JAR signing): true" not in signature:
        raise ValueError("Android 4.4-compatible APK v1 signing is required")
    certificates = re.findall(
        r"Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]{64})", signature
    )
    if len(certificates) != 1:
        raise ValueError("Exactly one APK signing certificate is required")
    fingerprint = certificates[0].lower()
    if channel == "stable" and fingerprint != expected.replace(":", "").lower():
        raise ValueError(
            "Release signing certificate does not match the expected identity"
        )
    return fingerprint


def verify_badging(badging, version, version_code, channel):
    """Match the built Android metadata to the selected release before packaging.

    A successful build can still contain stale/default version settings. Stable
    artifacts must also use the release build type rather than a debuggable APK.
    """
    package = re.search(
        r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging
    )
    if not package or package.groups() != (
        "dev.nemesis.usbmanager",
        str(version_code),
        version,
    ):
        raise ValueError(
            "APK package/version metadata does not match the selected release"
        )
    if "sdkVersion:'19'" not in badging:
        raise ValueError("APK must retain Android API 19 compatibility")
    if channel == "stable" and "application-debuggable" in badging:
        raise ValueError("Stable APK must not be debuggable")


def verify_apk(apk, sdk, version, version_code, channel, expected=""):
    """Return the verified public certificate fingerprint, never private key data.

    Pass arguments directly to SDK tools. A nonzero tool result is a validation
    failure, and stable artifacts must match the configured persistent identity.
    """
    tools = sdk / "build-tools" / "35.0.0"
    signer = tools / ("apksigner.bat" if os.name == "nt" else "apksigner")
    aapt = tools / ("aapt.exe" if os.name == "nt" else "aapt")
    signature = subprocess.run(
        [
            str(signer),
            "verify",
            "--min-sdk-version",
            "19",
            "--verbose",
            "--print-certs",
            str(apk),
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    fingerprint = certificate(signature, channel, expected)
    badging = subprocess.run(
        [str(aapt), "dump", "badging", str(apk)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    verify_badging(badging, version, version_code, channel)
    return fingerprint
