# Package Manager: Windows setup

## A. Download

NEMESIS must already work on your head unit. Download `usb-package-manager-ready.zip` from a release. Alternatively, open **Actions â†’ Build Package Manager**, download the successful run's `nemesis-usb-package-manager` artifact, and extract that wrapper first.

## B. Prepare the drive

Extract `usb-package-manager-ready.zip` onto a FAT32/exFAT drive recognized by the head unit. Keep `manager/usb.package.manager.zip` compressed. Put community releases under `packages/<Name>/`; follow [supported layouts](RELEASE-LAYOUTS.md).

Optional Python tools run from a source checkout:

```powershell
python tools/prepare_usb.py --usb E:\ --bundle .\usb-package-manager-ready.zip --add .\downloads\example-usb.zip
```

For later additions:

```powershell
python tools/import_release.py .\downloads\example-usb.zip --usb E:\ --name Example
```

The importer preserves existing data folders. Use `--overwrite` only to replace an existing release's installer files. Scripts that assume files are at the USB root may require their author's adaptation.

## C. First launch

With the vehicle parked and the head unit fully booted, insert the drive and approve the execution prompt. NEMESIS installs Package Manager if missing and opens it. The launcher then backs up its own root descriptor as `NEMESIS.data.disabled`, so future startups do not prompt to execute the drive. Open **NEMESIS Manager â†’ Packages â†’ Package Manager â†’ Launch** afterward.

Existing drives need the new launcher to run once for this change. It never replaces an existing disabled-descriptor backup or disables an unrelated install descriptor. If a backup already exists, a numbered backup is created instead. Reinserting the drive does not reinstall community packages.

## D. Install and update packages

For the full update procedure, including replacing another package's installer, updating Package Manager itself, and handling failures, see [Updating packages](UPDATING.md).

Select a package and choose **Install**, **Update**, **Launch**, or **Uninstall**. Scripts use **Run script**. The progress bar animates while work runs; NEMESIS does not provide a trustworthy percentage. Do not remove the drive during an operation. Confirmation buttons are separated to reduce accidental taps.

To update another app, import its new release into the same folder with `--overwrite`, preserving `data/`, then tap **Refresh**, select it, and choose **Update**. Installer versions are shown for reference, not as a claim that a newer version has been detected. Package authors can use arbitrary version formats.

Both manager UIs share installed packages. Wait for one operation to finish before starting another in either UI. Completion popups explain the result; their **Details** shows exit codes and output. Package Details contains full source and data/history paths.

## E. Update Package Manager itself

See [the detailed manager update steps](UPDATING.md#update-package-manager), including the fallback for older versions without the Update action.

1. Download a new release and replace `manager/usb.package.manager.zip` on your existing drive with its internal installer ZIP. Keep existing package folders and data. Do not copy a new active root descriptor merely to update the app.
2. Open Package Manager, tap **Refresh**, select **Package Manager**, and choose **Update**.
3. Confirm. The installer is copied to head-unit temporary storage before a detached NEMESIS process updates it. The app closes and should reopen; do not start another operation or remove power while it updates.
4. If it does not reopen, launch it through NEMESIS Manager. Check `/data/nemesis/logs/package-manager-update.log` for the installer result. The app stays busy until the installer finishes or Android replaces its process.

You can still install or update directly through NEMESIS using a separate drive with an install descriptor pointing to `usb.package.manager.zip`. Remove Package Manager only through **NEMESIS Manager â†’ Packages â†’ Package Manager â†’ Uninstall**. Its technical package ID remains `usb.package.manager`.

## Data and troubleshooting

- Uninstalling keeps installer files and `packages/<Name>/data/`. Other apps keep their own export locations unless configured separately.
- **Installed state unavailable:** check the displayed NEMESIS error, then Refresh. Package-changing actions stay disabled until the query succeeds.
- **Invalid installer:** select Details to inspect the descriptor/path error.
- **History could not be saved:** inspect the popup Details and check drive connectivity and write access.
- A recurring execution prompt means an active root descriptor remains; confirm that first-launch disabling succeeded.

Only run trusted packages. Hooks and scripts run as root. This manager does not resolve package conflicts or establish firmware compatibility. New update and launcher behavior still requires head-unit validation.
