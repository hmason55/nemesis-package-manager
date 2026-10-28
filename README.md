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

- Reopen the app through **NEMESIS Manager → Packages → Package Manager → Launch**.
- Both UIs share the installed packages. Finish one operation before starting another in either UI, and refresh after changes.
- Completion popups explain the result. Open their **Details** for diagnostic output.
- USB installers and `data/` remain after uninstall. Other apps retain their own recording/export locations unless configured separately.

The execution prompt can recur when the drive is detected at vehicle startup. To stop automatic opening, rename only the USB root's `NEMESIS.data` to `NEMESIS.data.disabled`, then open Package Manager manually through NEMESIS Manager. Installed packages and services retain their normal startup behavior.

## Update or remove Package Manager

Use **NEMESIS's package installer** to install or update Package Manager, and **NEMESIS Manager → Packages → Package Manager → Uninstall** to remove it. The app prevents changing its own installation through its package list.

**Copying a new bundle onto USB does not update an installed app.** Follow the [explicit update steps](docs/SETUP-WINDOWS.md#e-update-package-manager-itself). The technical package ID remains `usb.package.manager` for compatibility.

## Before installing packages

Only install trusted releases: NEMESIS hooks and scripts run with root privileges. Package Manager does not resolve conflicts or guarantee firmware compatibility. Scripts that hard-code USB-root paths may need their author's adaptation before use in a nested folder. Keep existing recordings and backups when preparing your drive.

## Development

Successful builds on `main` publish tagged releases with change notes and SHA-256 checksums. PR builds run checks without publishing. Artifact ZIP filenames retain their existing names for compatibility.

- [Build, tests, and releases](docs/BUILD-AND-TEST.md)
- [Contribution and quality standards](CONTRIBUTING.md)
- [NEMESIS documentation](https://github.com/xwtk/hmg_nemesis)

## License

GNU Affero General Public License, version 3. See [LICENSE](LICENSE).
