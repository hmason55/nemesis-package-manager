"""Toggle only Package Manager's own USB execution descriptor.

Foreign install/execute descriptors and existing backups are never overwritten.
Known old launchers can be upgraded to honor the persistent auto-launch setting;
custom launcher scripts require manual review instead of silent replacement.
"""

import configparser
from tools.bundle_templates import LAUNCHER
from tools.companion_drives import checked_path
from tools.release_metadata import read_config

FLAG = "manager/auto-launch.enabled"
GUARD = '[ ! -f "$ROOT/manager/auto-launch.enabled" ] && '


def descriptor(root, name):
    """Identify our execution descriptor without treating foreign files as ours.

    Corrupt or oversized manifests stay untouched. All reads still reject links
    and junctions through checked_path before any descriptor can be activated.
    """
    path = checked_path(root, name)
    try:
        if path.is_file() and path.stat().st_size <= 1024 * 1024:
            cfg = read_config(path.read_bytes())
            if cfg.get("type") == "execute" and cfg.get("path") == "NEMESIS.sh":
                return path
    except (OSError, ValueError, configparser.Error):
        return None
    return None


def launcher_state(root):
    """Describe the actual descriptor, independent of app installation state."""
    active = checked_path(root, "NEMESIS.data")
    disabled = [
        p
        for p in sorted(root.glob("NEMESIS.data.disabled*"))
        if descriptor(root, p.name)
    ]
    owned = descriptor(root, "NEMESIS.data")
    return {
        "enabled": bool(owned),
        "available": bool(owned or disabled) and (not active.exists() or bool(owned)),
        "persistent": checked_path(root, FLAG).is_file(),
    }


def set_launcher(root, enabled):
    """Keep backup descriptors and refuse collisions or custom launcher changes."""
    if not isinstance(enabled, bool):
        raise ValueError("Choose whether automatic launch is enabled.")
    state = launcher_state(root)
    if not state["available"]:
        raise ValueError(
            "No Package Manager launcher, or an unrelated root descriptor is active."
        )
    script = checked_path(root, "NEMESIS.sh")
    if script.read_text(encoding="utf-8") not in (
        LAUNCHER,
        LAUNCHER.replace(GUARD, ""),
    ):
        raise ValueError(
            "Custom launcher detected. Restore the release launcher before changing automatic launch."
        )
    active = checked_path(root, "NEMESIS.data")
    flag = checked_path(root, FLAG)
    if enabled:
        # Update the recognized legacy script before enabling persistent launch.
        script.write_text(LAUNCHER, encoding="utf-8", newline="\n")
        flag.parent.mkdir(exist_ok=True)
        flag.write_text("enabled\n", encoding="ascii")
        if not active.exists():
            source = next(
                p
                for p in sorted(root.glob("NEMESIS.data.disabled*"))
                if descriptor(root, p.name)
            )
            source.rename(active)
    else:
        if active.exists():
            backup = checked_path(root, "NEMESIS.data.disabled")
            index = 0
            while backup.exists():
                index += 1
                backup = checked_path(root, f"NEMESIS.data.disabled.{index}")
            active.rename(backup)
        flag.unlink(missing_ok=True)
