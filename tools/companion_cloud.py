"""Background cloud jobs keep network work outside serialized USB publication.

A job owns one drive selection capability for its whole lifetime. Downloads and
validation use temporary computer storage. Only a verified file reaches the
existing importer while the drive lock is held. Failures are reported per item;
no worker thread is killed during an installer/data directory swap.
"""

import copy
import secrets
import threading

from tools.companion_metadata import scan_drive
from tools.companion_cloud_destinations import available_updates
from tools.companion_cloud_transfer import prepare
from tools.registry_client import RegistryClient


class CloudJobs:
    """Own a single batch, its cancellation event, and synchronized progress."""

    def __init__(self, server, base):
        self.server = server
        self.client = RegistryClient(base) if base else None
        self.lock = threading.RLock()
        self.job = None
        self.cancelled = threading.Event()
        self.thread = None

    def registry(self):
        """Fail cloud requests clearly while leaving manual imports usable."""
        if not self.client:
            raise ValueError(
                "Cloud registry is not configured. Enter its HTTPS address in Registry connection, or start with --registry-url HTTPS_URL."
            )
        return self.client

    def snapshot(self):
        """Return an isolated status value, never a live mutable job reference."""
        with self.lock:
            return copy.deepcopy(self.job)

    def update(self, **values):
        """Publish progress under the same lock used by HTTP polling."""
        with self.lock:
            self.job.update(values)

    def start(self, selection_id, items):
        """Validate the batch before capturing the selected drive capability.

        Only the HTTP thread starts jobs. The drive lock prevents it from
        accepting another job while the previous worker is publishing an item.
        Progress uses a separate lock so polling never waits on a USB swap.
        A caller receives a copy of the initial state, not the worker's list.
        """
        self.registry()
        if not isinstance(items, list) or not 1 <= len(items) <= 50:
            raise ValueError("Select between 1 and 50 package versions.")
        for item in items:
            if not isinstance(item, dict) or not all(
                isinstance(item.get(k), str) and item[k]
                for k in ("package_id", "version")
            ):
                raise ValueError("Select a package ID and version for every item.")
        with self.server.drive_lock:
            self.server.bound_root(selection_id)
            current = self.snapshot()
            if current and current["status"] == "running":
                raise ValueError("Wait for the current cloud preparation job.")
            self.cancelled.clear()
            self.job = {
                "id": secrets.token_hex(16),
                "status": "running",
                "results": [],
                "progress": 0,
                "total": 0,
                "current": "",
            }
            self.thread = threading.Thread(
                target=self._run, args=(selection_id, items), daemon=True
            )
            self.thread.start()
            return self.snapshot()

    def _run(self, selection_id, items):
        """Complete all result rows, including items skipped by cancellation."""
        for item in items:
            result = {
                "package_id": item["package_id"],
                "version": item["version"],
                "success": False,
            }
            try:
                if self.cancelled.is_set():
                    raise ValueError("Cancelled before this package was changed.")
                prepare(
                    self.server,
                    self.registry(),
                    selection_id,
                    item,
                    self.cancelled,
                    self.update,
                )
                result["success"] = True
            except Exception as error:
                result["error"] = (
                    str(error)
                    if isinstance(error, (ValueError, OSError))
                    else "Cloud preparation failed. Existing files were kept."
                )
            with self.lock:
                self.job["results"].append(result)
        self.update(status="cancelled" if self.cancelled.is_set() else "complete")

    def updates(self):
        """Snapshot USB contents under lock; query the registry outside it."""
        with self.server.drive_lock:
            packages = scan_drive(self.server.selected_root())["packages"]
        return available_updates(self.registry(), packages)
