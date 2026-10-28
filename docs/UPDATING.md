# Updating packages

Package Manager installs the files you put on the drive. It does not check online for new releases, download updates, compare installed versions, or resolve dependencies and conflicts. Download the release you want on your PC first and check its compatibility and update instructions.

The **Installer** version in a package row describes the file on the drive, not the version currently installed. **Update** means the same package ID is already installed; it does not guarantee that the selected installer is newer. Selecting an older or identical installer can reinstall that version.

## Update another package

1. Download the package's new release and read its update instructions. Back up any settings or data its author says an update may replace.
2. On your PC, import the release into the **same folder** used for that package. From a source checkout, for example:

   ```powershell
   python tools/import_release.py .\downloads\example-new-release.zip --usb E:\ --name Example --overwrite
   ```

   This replaces installer files under `E:\packages\Example\` while preserving its `data\` folder. It only prepares the drive; it does not install anything on the vehicle. Keep the folder name consistent instead of accumulating old installers for the same package.
3. If preparing the drive manually, replace the old installer files and descriptor with the new release's files inside `packages/Example/`. Keep `data/` and any user exports. Do not overwrite the drive's root descriptor. For USB-ready bundles, extract the outer archive but keep the inner package ZIP compressed. See [release layouts](RELEASE-LAYOUTS.md).
4. With the vehicle parked and the head unit running, insert the drive. Open **NEMESIS Manager > Packages > Package Manager > Launch** and tap **Refresh**.
5. Select the package, check its installer version and **Details**, then tap **Update** and confirm. NEMESIS validates the installer and performs the update. There is normally no need to uninstall first.
6. Wait for the result popup. The animated bar indicates activity, not a percentage. Open popup **Details** for the exit code and output, then follow any package-specific restart or setup instructions.

If the action says **Install**, NEMESIS did not report that installer's package ID as installed. Confirm that you selected the right release; matching display names do not establish matching IDs. If there is no installer on the drive, an installed-only entry cannot be updated until you add one. Execute-only scripts use **Run script**, not the package update flow.

## Update Package Manager

1. Download `usb.package.manager.zip` from the new Package Manager release. This is the internal NEMESIS installer; keep it compressed. If you downloaded `usb-package-manager-ready.zip` instead, extract it on your PC and take the ZIP from its `manager/` directory.
2. Replace **only** `manager/usb.package.manager.zip` on your existing drive with that new installer. Keep the community package folders and user data. Do not put a new active `NEMESIS.data` at the root just to update the app: that can re-enable the startup execution prompt.
3. Open Package Manager from NEMESIS Manager, tap **Refresh**, select **Package Manager**, and tap **Update**. The installer in `manager/` is discovered automatically; you do not need to copy it under `packages/`.
4. Confirm the update. The app stages the installer on the head unit, then hands it to a detached NEMESIS installer process. Package Manager will close while Android replaces its APK and should reopen afterward. Do not start another operation or turn off the head unit while this is happening.
5. The progress indicator stays active while the NEMESIS installer runs. Closing and reopening the activity does not clear that busy state. If the app does not reopen, launch it through NEMESIS Manager. Check `/data/nemesis/logs/package-manager-update.log` for the result; `Update_exit_code=0` means the NEMESIS install command succeeded. A failed update may reopen the old app, so reopening alone is not proof that the new version installed.

The manager can update itself through NEMESIS but cannot uninstall itself from its own UI. To remove it, use **NEMESIS Manager > Packages > Package Manager > Uninstall**. Its package ID remains `usb.package.manager` across releases.

### Older manager versions and direct installation

If your installed version does not offer the manager update action, use NEMESIS's normal installer to update it first. Prepare a separate update drive with these files at its root:

```text
NEMESIS.data
usb.package.manager.zip
```

The ZIP must be the new internal installer. Put this in `NEMESIS.data`:

```ini
[nemesis]
version=1.0
type=install
path=usb.package.manager.zip
```

Insert that drive after the head unit has booted, confirm NEMESIS's update prompt, and wait for completion. Return to your normal package drive afterward. Keep its disabled root descriptor disabled.

## What is preserved

The importer preserves each package's USB `data/` folder. Package Manager does not erase USB installers or exports when uninstalling a package. This does **not** guarantee preservation of settings or files on the head unit: NEMESIS and the package's install hooks control those. Back up important files and follow the package author's instructions.

Use one operation at a time across both UIs. The manager's busy protection does not lock NEMESIS Manager or commands started elsewhere. An uninstall or failed update is not an automatic rollback mechanism.

## When an update cannot proceed

| Symptom | Next step |
| --- | --- |
| No Update action | Confirm the installer exists in the expected folder, then Refresh. Installed-only entries need an installer; scripts use Run script. |
| Installed state unavailable | Read the NEMESIS error and restore its command channel, then Refresh. Do not treat unknown state as uninstalled. |
| Invalid installer | Open package Details and check the descriptor, referenced ZIP, and release layout. |
| Update failed | Read popup Details and the package history, if saved. Resolve the error before retrying; uninstalling first may discard settings. |
| Manager update appears stuck | Check the head-unit update log and open NEMESIS Manager. Avoid launching a second installer while the first may still be running. |
| Execution prompt returns | A root execute descriptor is active again. Let the updated launcher disable its own descriptor once, or disable that descriptor manually; updating an installer ZIP alone does not require re-enabling it. |
