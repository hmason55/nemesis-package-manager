"""Enumerate the same installer layouts accepted by the head-unit scanner.

Descriptors take precedence over loose ZIP files in a package folder. A folder
without a descriptor contributes one row per immediate ZIP, while raw ZIPs are
also accepted directly under packages/. Data-only and hidden folders are ignored.
Loose archives can be inspected but are not directory replacement destinations;
the UI allows removal only, so importing an update cannot overwrite a ZIP path
with a directory or silently leave the old installer alongside a managed copy.
"""

from tools.companion_drives import checked_path


def package_locations(root):
    """Yield relative paths and whether each row is described by a manifest.

    Check a directory before listing children so links cannot expose filenames
    outside the selected drive. A rejected directory is still returned as a row;
    the metadata reader reports its error without following the link.
    """
    packages = checked_path(root, "packages")
    if not packages.is_dir():
        return
    for entry in sorted(packages.iterdir(), key=lambda p: p.name.casefold()):
        if entry.name.startswith("."):
            continue
        if entry.is_file() and entry.suffix.lower() == ".zip":
            yield entry.relative_to(root).as_posix(), False
        elif entry.is_dir():
            try:
                directory = checked_path(root, entry.relative_to(root))
            except ValueError:
                yield entry.relative_to(root).as_posix(), True
                continue
            if (directory / "NEMESIS.data").exists():
                yield entry.relative_to(root).as_posix(), True
            else:
                for child in sorted(
                    directory.iterdir(), key=lambda p: p.name.casefold()
                ):
                    if child.is_file() and child.suffix.lower() == ".zip":
                        yield child.relative_to(root).as_posix(), False
