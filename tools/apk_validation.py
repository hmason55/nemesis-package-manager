"""Structural validation for KitKat-installable APK archives."""

import zipfile
from pathlib import Path


def validate_apk(apk: Path):
    """Catch accidental packaging of placeholders or empty build outputs.

    This is a structural check, not runtime compatibility or cryptographic verification.
    """
    if not apk.is_file() or apk.stat().st_size < 1000:
        raise ValueError(f"APK must be built first: {apk}")
    try:
        with zipfile.ZipFile(apk) as z:
            names = set(z.namelist())
            required = {"AndroidManifest.xml", "classes.dex"}
            if not required.issubset(names):
                raise ValueError("APK lacks AndroidManifest.xml or classes.dex")
            if not any(
                n.startswith("META-INF/") and n.upper().endswith(".RSA") for n in names
            ):
                raise ValueError(
                    "APK appears unsigned or lacks Android 4.4-compatible v1 JAR signature"
                )
            if z.testzip() is not None:
                raise ValueError("APK has corrupt ZIP members")
    except zipfile.BadZipFile as ex:
        raise ValueError("APK is not a valid ZIP archive") from ex
