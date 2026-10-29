"""Validate identities before an installer can replace another release.

Directory names are chosen by users and cannot establish package identity.
Install descriptors and source directories represent the same package family;
execute scripts must remain scripts even if an author reuses an application ID.
An ID-less script can be imported, but replacement requires a verified identity.
"""

import re


def validate_package_id(value):
    """Use the same package identity rules as Android's PackageScanner.validId."""
    if not re.fullmatch(r"[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}", value) or ".." in value:
        raise ValueError("Invalid package ID: " + value)


def check_replacement(previous, incoming):
    """Never remove an installer on the assumption that a folder is its identity."""
    if previous["error"] or not previous.get("id") or not incoming.get("id"):
        raise ValueError(
            "Cannot verify this package's identity. Add the release in a new folder "
            "instead; the existing installer and data were kept."
        )
    if previous["id"] != incoming["id"] or (
        (previous["kind"] == "execute") != (incoming["kind"] == "execute")
    ):
        raise ValueError(
            "This release belongs to a different package. Add it in a new folder "
            "instead; the existing installer and data were kept."
        )
