"""Stage CI signing material without logging secrets; remove only our own file."""

import argparse
import base64
import os
from pathlib import Path
import re


def signing_path(environment):
    """Keep the private key outside the checkout and reject escaping symlinks.

    RUNNER_TEMP belongs to the isolated job. Cleanup resolves the same fixed path
    and never performs a recursive deletion of a caller-supplied directory.
    """
    root = Path(environment["RUNNER_TEMP"]).resolve()
    target = root / "nemesis-release-signing" / "release.jks"
    if not target.resolve().is_relative_to(root):
        raise ValueError("Signing path escapes runner temporary storage")
    return target


def stage(environment):
    """Fail before writing unless credentials and a public trust anchor exist.

    Only the temporary filename is exported through GITHUB_ENV. Passwords remain
    step-scoped environment values; errors report setting names, never contents.
    The keystore file is private to its owner on runners supporting POSIX modes.
    """
    required = (
        "NEMESIS_KEYSTORE_BASE64",
        "NEMESIS_STORE_PASSWORD",
        "NEMESIS_KEY_ALIAS",
        "NEMESIS_KEY_PASSWORD",
        "NEMESIS_SIGNING_CERT_SHA256",
    )
    if any(not environment.get(name) for name in required):
        raise ValueError(
            "Release signing credentials and certificate fingerprint are required"
        )
    fingerprint = environment["NEMESIS_SIGNING_CERT_SHA256"].replace(":", "").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
        raise ValueError("Invalid expected signing certificate fingerprint")
    try:
        material = base64.b64decode(
            environment["NEMESIS_KEYSTORE_BASE64"], validate=True
        )
    except (ValueError, base64.binascii.Error) as error:
        raise ValueError("Invalid signing keystore encoding") from error
    if not material:
        raise ValueError("Signing keystore is empty")
    target = signing_path(environment)
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    target.write_bytes(material)
    target.chmod(0o600)
    with Path(environment["GITHUB_ENV"]).open("a", encoding="utf-8") as output:
        output.write("NEMESIS_KEYSTORE_PATH=" + str(target) + "\n")
    return target


def clean(environment):
    """Remove our fixed key file, retaining unrelated runner temporary files.

    This is idempotent when setup failed before producing any signing material.
    A nonempty staging directory is preserved rather than recursively erased.
    """
    target = signing_path(environment)
    target.unlink(missing_ok=True)
    if target.parent.exists():
        target.parent.rmdir()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clean", action="store_true")
    options = parser.parse_args()
    if options.clean:
        clean(os.environ)
    else:
        stage(os.environ)
