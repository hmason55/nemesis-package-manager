# Package Manager

Browse and install NEMESIS community packages from one USB drive on a compatible Gen5W head unit. Package Manager uses NEMESIS to install, update, launch, and uninstall packages; it does not replace NEMESIS Manager.

**Requires NEMESIS already installed.** This is an experimental, debug-signed application. Check each community package's vehicle and firmware requirements before installing it.

## Get started

1. Download `usb-package-manager-ready.zip` from the [latest release](https://github.com/hmason55/nemesis-package-manager/releases/latest) and extract it to your USB root. Keep the internal `manager/usb.package.manager.zip` compressed.
2. Add each community release under `packages/<Name>/`. Extract USB-ready bundles there; keep their inner installer ZIPs compressed. See [supported layouts](docs/RELEASE-LAYOUTS.md) for raw package ZIPs and scripts.
3. With the vehicle parked and the head unit fully booted, insert the drive and approve the NEMESIS execution prompt. The launcher installs Package Manager if missing, then opens it. Community packages are installed only when you select and confirm an action.
4. Select a package and choose **Install**, **Update**, **Run script**, **Launch**, or **Uninstall**. **Details** shows paths, versions, and history locations.

For Windows preparation, importing tools, and troubleshooting, follow the [setup guide](docs/SETUP-WINDOWS.md). Python import tools require a source checkout; they are optional for manual USB setup.

```text
USB/
  NEMESIS.data
  NEMESIS.sh
  manager/usb.package.manager.zip
  packages/
    Example/
      NEMESIS.data
      packages/example.zip
      data/
```

## Everyday use

- Reopen the app through **NEMESIS Manager > Packages > Package Manager > Launch**.
- Both UIs share the installed packages. Finish one operation before starting another in either UI, and refresh after changes.
- Completion popups explain the result. Open their **Details** for diagnostic output.
- USB installers and `data/` remain after uninstall. Other apps retain their own recording/export locations unless configured separately.

After a successful first launch, the launcher renames its root descriptor to `NEMESIS.data.disabled`. The drive no longer triggers an execution prompt on each startup. Open Package Manager from NEMESIS Manager. Existing drives need to run the new launcher once; its backup is preserved. If a backup already exists, the launcher keeps it and saves a numbered backup.

## Updates

Download releases on your PC; Package Manager does not check for or download updates automatically.

- **Other packages:** replace the installer in the same `packages/<Name>/` folder, preserving `data/`. Open the app, Refresh, select the package, and confirm **Update**.
- **Package Manager:** replace `manager/usb.package.manager.zip` with the new internal installer. Refresh, select **Package Manager**, and confirm **Update**. NEMESIS replaces the app, which closes and should reopen. The progress indicator remains active until the installer finishes or Android replaces the app process.
- **Removal:** use NEMESIS Manager's Packages screen to uninstall Package Manager itself.

Installer versions describe files on the drive, not the installed version. The app does not decide whether an installer is newer. See [the update guide](docs/UPDATING.md) for exact steps, older-version upgrades, data preservation, and recovery.

## Before installing packages

Only install trusted releases: NEMESIS hooks and scripts run with root privileges. Package Manager does not resolve conflicts or guarantee firmware compatibility. Scripts that hard-code USB-root paths may need their author's adaptation before use in a nested folder. Keep existing recordings and backups when preparing your drive.

## Development

Successful builds on `main` publish tagged releases with change notes and SHA-256 checksums. PR builds run checks without publishing. Artifact ZIP filenames retain their existing names for compatibility.

- [Build, tests, and releases](docs/BUILD-AND-TEST.md)
- [Contribution and quality standards](CONTRIBUTING.md)
- [NEMESIS documentation](https://github.com/xwtk/hmg_nemesis)

## License

GNU Affero General Public License, version 3. See [LICENSE](LICENSE).
