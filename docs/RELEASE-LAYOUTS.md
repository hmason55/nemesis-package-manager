# Supported release layouts

For initial setup, keep only Package Manager's `NEMESIS.data` at the USB root. After a successful launch it is backed up as `NEMESIS.data.disabled`. Other release descriptors belong under `packages/<Name>/`.

## USB-ready installer

Outer ZIP contains `NEMESIS.data` with `type=install` and `path=packages/foo.zip`:

```text
USB/packages/Foo/
  NEMESIS.data
  packages/foo.zip
  data/
```

The manager reads the nested descriptor and passes the referenced ZIP to the official `nemesis install` command. The inner ZIP stays compressed.

## USB-ready execution script

Outer ZIP contains `NEMESIS.data` with `type=execute`, `path=NEMESIS.sh` (or other relative script):

```text
USB/packages/Foo-Tool/
  NEMESIS.data
  NEMESIS.sh
  assets/
  data/
```

The manager runs the referenced script only after explicit confirmation; the script executes as root. Some third-party scripts assume the **USB root** as working directory or hard-code `/storage/usb0`, and may need adaptation. The importer does not rewrite such scripts.

## Internal NEMESIS package ZIP

ZIP contains `NEMESIS.data` with `id=foo` and `[app.0]` or `[service.0]` but no `type=`. Keep it compressed and add a folder-local USB descriptor:

```text
USB/packages/Foo/
  NEMESIS.data       # wrapper type=install, path=payload.zip
  payload.zip        # internal install ZIP with its own NEMESIS.data
  data/
```

The automatic importer creates this wrapper for you.

## Unpacked package source directory

Folder contains `NEMESIS.data` with `id=foo` and no `type=`, plus `bin/`, `app/`, or `svc/`. The manager can create a temporary ZIP to install it. The top-level `data/` folder is excluded from that temporary ZIP, so user exports are preserved.

## Unsupported or unknown layouts

A downloaded release may contain multiple install bundles, custom root files, firmware-specific assets, or manual steps. Do not force-import it or bypass errors. Follow its upstream instructions and inspect the descriptor first. A USB-ready ZIP may not be compatible with moving into a subfolder if its scripts use absolute `/storage/usb0/...` paths.

## Storage convention

`packages/<Name>/data/` is owned by the user. The manager writes history here and never deletes it. It cannot transparently redirect third-party applications' own output files. Check each application's documented output-directory setting.
