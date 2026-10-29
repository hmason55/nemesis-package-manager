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

## Local USB companion

Each new release includes a standalone USB companion for Windows and Linux
(x86-64). Download `nemesis-usb-companion-windows-x86_64.zip` or
`nemesis-usb-companion-linux-x86_64.tar.gz` from the
[latest release](https://github.com/hmason55/nemesis-package-manager/releases/latest),
extract it, and run the companion. No Python or Node installation is needed.
Its local browser UI uses a blue, black, and gray theme and handles manager setup,
package imports, installer replacement, and versions on USB.
See [the companion guide](docs/USB-COMPANION.md) for usage, source development,
and recovery details.

## Everyday use

- Reopen the app through **NEMESIS Manager > Packages > Package Manager > Launch**.
- Tap **Help** beside Refresh for a quick guide to the tabs, updates, and common actions.
- Both UIs share the installed packages. Finish one operation before starting another in either UI, and refresh after changes.
- Completion popups explain the result. Open their **Details** for diagnostic output.
- **Installed** opens first, followed by **Updates**, **Available**, and **Scripts**. Each tab has **Name** and **Version** columns. Installed shows the installed version; Available and Scripts show the USB version. Updates compares both in one cell, such as `v0.5 -> v0.6`. Tab counts include every matching installer; scripts have their own category. Installed packages with a confirmed newer USB installer appear in both Installed and Updates, and never in Available. If installed-state detection fails, tap Refresh to retry before browsing package categories.
- A spinner and operation text remain visible during scanning, installing, updating, and uninstalling. Wait for the result before removing USB.
- USB installers and `data/` remain after uninstall. Other apps retain their own recording/export locations unless configured separately.

After a successful first launch, the launcher renames its root descriptor to `NEMESIS.data.disabled`. The drive no longer triggers an execution prompt on each startup. Open Package Manager from NEMESIS Manager. Existing drives need to run the new launcher once; its backup is preserved. If a backup already exists, the launcher keeps it and saves a numbered backup.

## Updates

Download releases on your PC; Package Manager does not check for or download updates automatically.

- **Other packages:** replace the installer in the same `packages/<Name>/` folder, preserving `data/`. Open the app, Refresh, select the package, and confirm **Update**.
- **Package Manager:** replace `manager/usb.package.manager.zip` with the new internal installer. Refresh, select **Package Manager**, and confirm **Update**. NEMESIS replaces the app, which closes and should reopen. The progress indicator remains active until the installer finishes or Android replaces the app process.
- **Removal:** use NEMESIS Manager's Packages screen to uninstall Package Manager itself.

The **Version** column shows the installed release in Installed, the USB release in Available and Scripts, and a comparison in Updates. Details lists installed and USB versions separately. Identical releases show a disabled **Up to date** action; older numeric releases show **Older installer**. **Updates** contains confirmed newer releases. If version metadata is unavailable or custom version strings cannot be ordered, **Install version** allows an explicit installation after confirmation without claiming an update is available. See [the update guide](docs/UPDATING.md).

## Before installing packages

Only install trusted releases: NEMESIS hooks and scripts run with root privileges. Package Manager does not resolve conflicts or guarantee firmware compatibility. Scripts that hard-code USB-root paths may need their author's adaptation before use in a nested folder. Keep existing recordings and backups when preparing your drive.

## Development

Successful builds on `main` publish tagged releases with change notes and SHA-256 checksums. PR builds run checks without publishing. Artifact ZIP filenames retain their existing names for compatibility.

- [Build, tests, and releases](docs/BUILD-AND-TEST.md)
- [Contribution and quality standards](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Report a security vulnerability privately](SECURITY.md)
- [NEMESIS documentation](https://github.com/xwtk/hmg_nemesis)

New contributors can start with the [development setup and first PR walkthrough](CONTRIBUTING.md#first-contribution). Documentation fixes and host-side tests do not require a vehicle. Use the [issue templates](https://github.com/hmason55/nemesis-package-manager/issues/new/choose) for bugs and feature requests.

## Credits

Package Manager is built on [NEMESIS](https://github.com/xwtk/hmg_nemesis/), developed by [xwtk](https://github.com/xwtk).

## License

GNU Affero General Public License, version 3. See [LICENSE](LICENSE).
