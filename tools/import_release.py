#!/usr/bin/env python3
"""Organize NEMESIS release ZIPs into packages/<slug>/ on USB without touching root NEMESIS.data."""
import argparse
import io
import re
import shutil
import zipfile
from pathlib import Path, PurePosixPath
import configparser

MAX_ENTRIES = 20000
MAX_UNCOMPRESSED = 3 * 1024**3


def is_data_name(name):
    # Reserve Windows aliases too, even when preparing the drive on Linux.
    return name.rstrip(' .').casefold() == 'data'


def read_config(content):
    cfg = configparser.ConfigParser(interpolation=None)
    cfg.read_string(content.decode('utf-8-sig'))
    if not cfg.has_section('nemesis'):
        raise ValueError('missing [nemesis] section')
    return cfg['nemesis']


def safe_zip(z):
    members = z.infolist()
    if len(members) > MAX_ENTRIES: raise ValueError('too many archive files')
    if sum(m.file_size for m in members) > MAX_UNCOMPRESSED:
        raise ValueError('archive exceeds uncompressed size limit')
    for m in members:
        path = PurePosixPath(m.filename)
        if path.is_absolute() or '..' in path.parts or '\\' in m.filename or ':' in m.filename:
            raise ValueError('unsafe zip member path: ' + m.filename)
        if ((m.external_attr >> 16) & 0o170000) == 0o120000:
            raise ValueError('symlink not allowed: ' + m.filename)
    return members


def detect(z):
    names = [x.filename for x in z.infolist() if not x.is_dir()]
    if 'NEMESIS.data' in names:
        cfg = read_config(z.read('NEMESIS.data'))
        # Package manifests have an id and no type; USB-ready bundles have type.
        if cfg.get('type', '').lower() in ('install', 'execute'):
            return 'usb', ''
        if cfg.get('id'):
            return 'pkg', ''
    # Some authors ship a single enclosing folder.
    candidates = [p for p in names if p.endswith('/NEMESIS.data') and p.count('/') == 1]
    if len(candidates) == 1:
        prefix = candidates[0][:-len('NEMESIS.data')]
        cfg = read_config(z.read(candidates[0]))
        if cfg.get('type', '').lower() in ('install','execute'):
            return 'usb', prefix
        if cfg.get('id'):
            return 'pkg', prefix
    raise ValueError('No recognizable NEMESIS.data manifest found; inspect release manually')


def import_release(source, usb, name=None, overwrite=False):
    if not source.is_file() or source.suffix.lower() != '.zip':
        raise ValueError('source must be a ZIP release archive')
    slug = name or (source.stem[:-4] if source.stem.endswith('-usb') else source.stem).replace(' ', '-')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}', slug):
        raise ValueError('invalid package folder name')
    root = usb / 'packages'
    dst = root / slug
    if dst.exists() and not overwrite:
        raise FileExistsError(f'{dst} exists. Use a new folder name (or --overwrite).')
    # Never delete a pre-existing data/ directory during release updates.
    root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as z:
        members = safe_zip(z)
        kind, prefix = detect(z)
        if dst.exists() and overwrite:
            for child in dst.iterdir():
                if is_data_name(child.name): continue
                if child.is_dir(): shutil.rmtree(child)
                else: child.unlink()
        dst.mkdir(exist_ok=True)
        if kind == 'pkg':
            # Preserve the release ZIP as-is: NEMESIS supports one enclosing package directory.
            shutil.copy2(source, dst / 'payload.zip')
            (dst / 'NEMESIS.data').write_text('[nemesis]\nversion=1.0\ntype=install\npath=payload.zip\n')
        else:
            for member in members:
                rel = member.filename
                if prefix:
                    if not rel.startswith(prefix): continue
                    rel = rel[len(prefix):]
                if not rel: continue
                if is_data_name(PurePosixPath(rel).parts[0]):
                    # Release archives do not overwrite exported/user data.
                    continue
                target = dst.joinpath(*PurePosixPath(rel).parts)
                if member.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with z.open(member) as input, target.open('wb') as output:
                        shutil.copyfileobj(input, output)
        (dst / 'data').mkdir(exist_ok=True)
    return dst, kind


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('release_zip', type=Path)
    ap.add_argument('--usb', required=True, type=Path, help='USB root, e.g. E:\\ or /media/USB')
    ap.add_argument('--name', help='Folder name shown in manager')
    ap.add_argument('--overwrite', action='store_true', help='Replace installer files but preserve data/')
    args = ap.parse_args()
    dest, kind = import_release(args.release_zip, args.usb, args.name, args.overwrite)
    print(f'Imported {kind} release to {dest}')
