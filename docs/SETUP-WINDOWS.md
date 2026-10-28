# NEMESIS USB Package Manager: Windows setup

**Status:** Experimental. Source project must first be built into an Android APK and the two NEMESIS ZIP archives. The source ZIP alone is **not** an installable NEMESIS package. No hardware validation has yet been completed on a US 2023 Ioniq 5.

## Prerequisites

- The actual NEMESIS framework must already be installed and working on your compatible Gen5W `S5W_M` head unit. The manager is **not** the initial NEMESIS installer and does not replace it.
- A USB flash drive recognized by the head unit, formatted **FAT32 or exFAT**.
- A Windows PC, optionally Python 3.8+ for bulk importing release ZIPs.
- A GitHub repository containing this complete project (or a local Android SDK + Gradle installation).

## A. Build the app with GitHub Actions (recommended)

1. Extract the **source project ZIP** on the PC. Do not place its Java/Gradle source folder on the USB expecting NEMESIS to install it.
2. Create a new **empty** GitHub repository of your choice, then push **all source files** to its `main` branch, preserving `.github/workflows/build.yml` and the `app/` and `tools/` directories. From Git Bash or PowerShell with Git installed:

   ```powershell
   cd .\nemesis-usb-package-manager
   git init -b main
   git add .
   git commit -m "Initial NEMESIS USB Manager"
   git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
   git push -u origin main
   ```

   Replace `YOUR-USER/YOUR-REPO` with your new repository. If the default branch already exists, follow GitHub's guidance instead of force-pushing. The workflow can read the repo and upload build artifacts; it does not modify the vehicle.
3. In GitHub, select **Actions -> Build USB Package Manager -> Run workflow** (or let the workflow run on the first push).
4. After a successful run, open the run's **Artifacts** section and download `nemesis-usb-package-manager.zip` (GitHub's wrapper archive).
5. Extract the wrapper archive on your PC. It should contain `usb-package-manager-ready.zip` and `usb.package.manager.zip`.
6. If the build fails, retain the Actions build log. Do **not** substitute a raw APK or rename a source ZIP to `usb.package.manager.zip`.

An Android 4.4-compatible APK needs a **v1 JAR signature**. The build tool checks that a v1 signature file exists, in addition to `classes.dex` and `AndroidManifest.xml`, before creating the NEMESIS archive. It does not guarantee the APK will install on your firmware.

## B. Prepare the USB with the built package manager

Extract **`usb-package-manager-ready.zip`** directly to the USB root. The USB should look like:

```text
E:\
  NEMESIS.data                   # type=execute, path=NEMESIS.sh
  NEMESIS.sh
  GETTING_STARTED.txt
  manager\
    usb.package.manager.zip     # keep compressed
  packages\
    README.txt
  docs\
    SETUP-WINDOWS.md
    RELEASE-LAYOUTS.md
```

The root `NEMESIS.data` is **permanent**. The manager's launcher (`NEMESIS.sh`) installs the APK on its first run and opens it subsequently. NEMESIS will request confirmation to run the script when Android is up. No package installation happens merely because you added a ZIP under `packages/`.

## C. Import each community release in its own folder

For USB-ready releases whose **outer** archive contains a root `NEMESIS.data` and `packages/` folder, extract each outer archive inside its own USB folder, not over the root descriptor:

```text
E:\
  NEMESIS.data
  NEMESIS.sh
  manager\usb.package.manager.zip
  packages\
    Mirror-Diagnostics\
      NEMESIS.data
      packages\mirror.diag.zip
      data\
    Leafia-Plus\
      NEMESIS.data
      packages\<actual-release-zip>.zip
      data\
    RearDashcam\
      NEMESIS.data
      packages\<actual-release-zip>.zip
      data\
```

**Do not extract the inner ZIP** referenced by `type=install`.

For an archive that is itself a NEMESIS package (it has an internal `NEMESIS.data` defining `id=...` and `[app.N]` or `[service.N]`), leave it compressed. You can place the ZIP in `packages\Name\payload.zip` with a nearby descriptor:

```ini
[nemesis]
version=1.0
type=install
path=payload.zip
```

Or use the importer to create the wrapper automatically.

To import any supported release ZIP automatically from Windows PowerShell (with Python installed):

```powershell
python .\tools\prepare_usb.py --usb E:\ --bundle .\usb-package-manager-ready.zip `
  --add .\downloads\mirror-diag-usb-install.zip `
  --add .\downloads\leafia-release-usb.zip `
  --add .\downloads\dashcam-release-usb.zip
```

Use the **actual names** of the downloaded releases. This example runs on a fresh USB. If files already exist, review them before passing `--overwrite`. Release imports preserve each `data\` folder.

If you already extracted the manager ZIP onto USB, import just an additional release:

```powershell
python .\tools\import_release.py .\downloads\another-usb.zip --usb E:\ --name Another-Package
```

## D. Use the manager on the head unit

1. Start with the vehicle **parked**. Insert the USB into the infotainment data port, with the head unit fully booted.
2. Approve NEMESIS's prompt to execute `NEMESIS.sh`.
3. The script checks that Android has booted, installs `usb.package.manager` once, and launches its activity. It does **not** install the third-party ZIPs.
4. The on-screen app lists found USB installers and already-installed NEMESIS packages. Tap a row, then choose **Install / Run**, **Launch**, **Uninstall**, or **Data folder** as applicable.
5. Read the confirmation message before every privileged action. Install firmware-modifying packages one at a time, and follow their own compatibility and reboot instructions.
6. Keep the USB inserted. You can reopen the manager anytime from **NEMESIS Manager -> Packages -> USB Package Manager -> Launch**, without editing `NEMESIS.data` or unplugging the drive.

## E. Data and recordings

- `packages\Name\data\` is a stable location that the USB Package Manager does not erase when uninstalling the package from NEMESIS.
- **Third-party apps do not automatically use this folder.** Their default export locations still apply unless configured separately.
- RearDashcam currently writes by default to `E:\Dashcam\` (on the head unit, `/storage/usb0/Dashcam`). Its technical docs describe `DASHCAM_ARGS="--out=/storage/usb0/packages/RearDashcam/data"` in `/data/nemesis/apps/dashcam/dashcam.conf`. Back up the file before changing it; updates may overwrite it. Verify recordings in the new path before deleting the old directory.
- Package-manager install/run history is appended to `packages\Name\data\package-manager-history.log` when USB writing succeeds.

## F. Common issues

| Symptom | Check |
| --- | --- |
| No NEMESIS execute prompt | NEMESIS must be installed first. Ensure `NEMESIS.data` is at the USB root and contains `type=execute`, `path=NEMESIS.sh` (not `NEMESIS.data.txt`). |
| NEMESIS says the manager ZIP is missing | `manager\usb.package.manager.zip` must exist, still compressed. |
| Manager shows no USB packages | Confirm `E:\packages\Name\NEMESIS.data` and that `path=` refers to a file within **that** `Name` folder. |
| Package listed as invalid | Check `path=` syntax, missing files, or whether you imported a source archive rather than a USB-ready/installable archive. |
| Install failed | Open `data\package-manager-history.log` and NEMESIS Manager's Logs. A package may be firmware-incompatible, broken, or require its own setup. |
| Manager doesn't appear | Check `nemesis pkg-list` and Android logcat; verify `dev.nemesis.usbmanager` was installed. This prototype has not been device-tested. |
| App's files go to another USB folder | Expected until that app is explicitly configured to use its per-package `data\` folder. |

## Important safety notes

- The `type=execute` launcher is run with root rights by NEMESIS. Third-party package hooks and scripts may also run as root. Treat USB content as trusted code and install only vetted releases.
- The manager does not detect package conflicts. For example, Leafia Plus's published instructions require uninstalling conflicting earlier wireless/projection patches before installing it.
- Avoid firmware modification or other potentially distracting experiments while driving. This is an experimental application and is not a substitute for the stock infotainment interface.
