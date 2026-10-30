"""Match approved registry identities to managed USB package directories.

Folder names are not package identities. A user must choose between duplicates;
loose installers remain inspection-only because the importer replaces folders.
The caller holds the drive lock and has revalidated the USB selection.
"""

from tools.companion_metadata import scan_drive
from tools.registry_versions import compare_versions


def destination(root, item):
    """Return a verified replacement folder or a new, non-overwriting destination."""
    matches = [
        p
        for p in scan_drive(root)["packages"]
        if p.get("id") == item["package_id"] and not p.get("error")
    ]
    folder = item.get("folder")
    if not matches:
        return folder or "pkg-" + item["package_id"][:60].rstrip("."), False
    eligible = [p for p in matches if p.get("replaceable") and p["kind"] != "execute"]
    if len(matches) != 1 and not folder:
        raise ValueError(
            "Several USB folders match this package. Choose a destination folder."
        )
    if folder:
        eligible = [p for p in eligible if p["folder"] == folder]
    if len(eligible) != 1:
        raise ValueError(
            "Select a managed installer folder for replacement; loose ZIPs remain view-only."
        )
    return eligible[0]["folder"], True


def available_updates(client, packages):
    """Compare installer versions, preserving per-package network errors.

    Arbitrary strings are valid versions but cannot establish a newer release.
    These remain accessible through explicit version selection in cloud browsing.
    """
    results = []
    for package in packages:
        if (
            not package.get("id")
            or package.get("error")
            or package["kind"] == "execute"
        ):
            continue
        result = {"package_id": package["id"], "folder": package["folder"]}
        try:
            remote = client.package(package["id"])
            result.update(
                on_usb=package["version"],
                versions=[
                    v
                    for v in remote["versions"]
                    if compare_versions(v["version"], package["version"]) == 1
                ],
            )
        except (ValueError, OSError) as error:
            result["error"] = str(error)
        results.append(result)
    return {"updates": results}
