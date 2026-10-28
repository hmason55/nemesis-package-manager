"""Reject archive paths and resource use outside supported limits."""

from pathlib import PurePosixPath

MAX_ENTRIES = 20000
MAX_UNCOMPRESSED = 3 * 1024**3


def safe_zip(z):
    """Validate the entire archive before any filesystem mutation.

    Entry and expanded-size limits bound resource use. Reject both POSIX and
    Windows traversal forms because the same archive can be prepared on either
    platform. Symlinks are rejected rather than followed during extraction.
    """
    members = z.infolist()
    if len(members) > MAX_ENTRIES:
        raise ValueError("too many archive files")
    if sum(m.file_size for m in members) > MAX_UNCOMPRESSED:
        raise ValueError("archive exceeds uncompressed size limit")
    for m in members:
        path = PurePosixPath(m.filename)
        if (
            path.is_absolute()
            or ".." in path.parts
            or "\\" in m.filename
            or ":" in m.filename
        ):
            raise ValueError("unsafe zip member path: " + m.filename)
        if ((m.external_attr >> 16) & 0o170000) == 0o120000:
            raise ValueError("symlink not allowed: " + m.filename)
    return members
