"""Identify supported package and USB-release descriptors."""

import configparser


def read_config(content):
    cfg = configparser.ConfigParser(interpolation=None)
    cfg.read_string(content.decode("utf-8-sig"))
    if not cfg.has_section("nemesis"):
        raise ValueError("missing [nemesis] section")
    return cfg["nemesis"]


def detect(z):
    names = [x.filename for x in z.infolist() if not x.is_dir()]
    if "NEMESIS.data" in names:
        cfg = read_config(z.read("NEMESIS.data"))
        # Package manifests have an id and no type; USB-ready bundles have type.
        if cfg.get("type", "").lower() in ("install", "execute"):
            return "usb", ""
        if cfg.get("id"):
            return "pkg", ""
    # Some authors ship a single enclosing folder.
    candidates = [p for p in names if p.endswith("/NEMESIS.data") and p.count("/") == 1]
    if len(candidates) == 1:
        prefix = candidates[0][: -len("NEMESIS.data")]
        cfg = read_config(z.read(candidates[0]))
        if cfg.get("type", "").lower() in ("install", "execute"):
            return "usb", prefix
        if cfg.get("id"):
            return "pkg", prefix
    raise ValueError(
        "No recognizable NEMESIS.data manifest found; inspect release manually"
    )
