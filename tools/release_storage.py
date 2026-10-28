"""Copy installer files while keeping user-owned data outside the replacement set."""

import shutil
from pathlib import PurePosixPath


def is_data_name(name):
    """Treat Windows case and trailing-dot aliases as the reserved data directory."""
    return name.rstrip(" .").casefold() == "data"


def clear_installers(destination):
    """Remove stale installer files, but never the user's exports or recordings."""
    for child in destination.iterdir():
        if is_data_name(child.name):
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def copy_usb(archive, members, prefix, destination):
    """Strip an optional enclosing release folder without changing script contents.

    Archive paths must already have passed safe_zip. Entries outside that folder
    and all reserved data aliases are deliberately left out of the copy.
    """
    for member in members:
        relative = member.filename
        if prefix:
            if not relative.startswith(prefix):
                continue
            relative = relative[len(prefix) :]
        if not relative or is_data_name(PurePosixPath(relative).parts[0]):
            continue
        target = destination.joinpath(*PurePosixPath(relative).parts)
        if member.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
