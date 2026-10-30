"""Transfer one verified cloud installer into the existing USB import workflow.

Network IO and ZIP validation occur in temporary computer storage, outside the
drive lock. The lock covers the final selection check and directory publication.
It protects against a concurrent import or drive change without serializing
unrelated status polling behind the entire network download.
"""

import tempfile
from pathlib import Path

from tools.companion_packages import add_package
from tools.companion_cloud_destinations import destination


def prepare(server, client, selection_id, item, cancelled, update):
    """Keep a cancelled or disconnected transfer away from existing USB files.

    Cancellation is checked after download as well as during streaming. Once the
    importer starts its directory swap, it runs to completion or its ordinary
    rollback path. User data is preserved by that existing importer, not copied
    by the cloud layer. The temporary archive is removed on every exit path.
    """
    update(current=item["package_id"], progress=0, total=0)
    with tempfile.TemporaryDirectory(prefix="nemesis-cloud-") as directory:
        archive = Path(directory) / "package.zip"
        client.download(
            item["package_id"],
            item["version"],
            archive,
            cancelled.is_set,
            lambda done, total: update(progress=done, total=total),
        )
        with server.drive_lock:
            if cancelled.is_set():
                raise ValueError("Cancelled before USB publication.")
            root = server.bound_root(selection_id)
            folder, overwrite = destination(root, item)
            add_package(root, archive, folder, overwrite=overwrite)
