"""Discover mounted media and constrain access to the selected drive.

Suggestions deliberately exclude fixed Windows disks. Linux users can also enter
a mount path when their desktop mounts USB media outside the usual directories.
Every managed path is checked for links before use, including on Windows where
junctions can redirect writes even when a path appears to stay under the drive.
"""

import os
import re
from pathlib import Path


def drive_candidates():
    """Suggest mounted drives; users can also select a mount path explicitly."""
    if os.name == "nt":
        import ctypes

        return [
            f"{letter}:\\"
            for letter in "DEFGHIJKLMNOPQRSTUVWXYZ"
            if ctypes.windll.kernel32.GetDriveTypeW(f"{letter}:\\") == 2
        ]
    candidates = []
    mounts = Path("/proc/self/mountinfo")
    if mounts.exists():
        for line in mounts.read_text().splitlines():
            value = re.sub(
                r"\\([0-7]{3})", lambda m: chr(int(m[1], 8)), line.split()[4]
            )
            if value.startswith(("/media/", "/run/media/", "/mnt/")):
                candidates.append(value)
    return sorted(set(candidates))


def drive_root(value):
    path = Path(value).expanduser()
    if not path.is_absolute() or not path.is_dir():
        raise ValueError("Select an existing absolute drive or mount path.")
    root = path.resolve()
    forbidden = {Path.home().resolve(), Path(__file__).resolve().parents[1]}
    if os.name == "nt":
        forbidden.add(Path(os.environ.get("SystemDrive", "C:") + "\\").resolve())
    else:
        forbidden.update(Path(p) for p in ("/", "/home", "/etc", "/usr", "/var"))
    if root in forbidden:
        raise ValueError("Select your USB drive, not a system or project directory.")
    return root


def checked_path(root, relative):
    """Reject escapes and links/junctions before reading or writing drive content."""
    relative = Path(relative)
    if (
        relative.is_absolute()
        or ".." in relative.parts
        or "\\" in str(relative)
        and os.name != "nt"
    ):
        raise ValueError("Invalid relative package path.")
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink() or getattr(current, "is_junction", lambda: False)():
            raise ValueError("Links and junctions are not supported in managed paths.")
    if not current.resolve().is_relative_to(root.resolve()):
        raise ValueError("Path leaves the selected drive.")
    return current
