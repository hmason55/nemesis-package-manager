# Build and test notes

This project targets Android API 19 (Android 4.4). The Android app has no dependency on Google Play Services. It calls NEMESIS's `/system/xbin/nemesis` via its documented command channel.

## Automated GitHub Actions build

The workflow `.github/workflows/build.yml` uses Java 17, Gradle 8.10.2, and AGP 8.7.3. Pull requests and pushes to `main` trigger it automatically; maintainers can also launch it manually. A merge into `main` therefore starts a new build. It runs host tests, builds `app-debug.apk`, checks its expected structure and JAR signature, creates the NEMESIS ZIP, and uploads `dist/` as the `nemesis-usb-package-manager` artifact.

Extract the downloaded artifact wrapper on your PC, then extract its `usb-package-manager-ready.zip` onto the normal USB. Installing a new build over an existing manager requires the explicit update procedure in [SETUP-WINDOWS.md](SETUP-WINDOWS.md#e-update-package-manager-itself); copying files alone does not update the installed APK.

## Automatic releases

After this workflow change is merged, every successful push to `main` publishes a GitHub Release. Python quality gates, host tests, Android view tests, APK compilation, and bundle validation must pass first. PR and manually dispatched runs build artifacts but never publish releases.

Versions use the Android base version plus the workflow run number, for example `0.2.0-build.42`, tagged as `v0.2.0-build.42` at the tested commit. CI writes the same version into the APK and NEMESIS manifest and assigns an increasing Android version code. Local builds retain the checked-in version defaults.

Each release contains the two installer ZIPs and `SHA256SUMS`, generated change notes since the previous release, and links to update instructions. These remain experimental debug-signed builds. Uploads are staged in an unpublished release until complete; retries verify tag identity and existing asset contents instead of overwriting published files. A failed publishing run can be rerun after resolving the error.

## Local build commands

Follow the [contributor setup](../CONTRIBUTING.md#development-setup) for JDK 17, Python 3.12, and Android SDK platform 35/build tools 35.0.0. Accept SDK licenses. The checked-in wrapper downloads Gradle 8.10.2 and verifies its SHA-256; no global Gradle installation is needed. Then:

```shell
bash gradlew --no-daemon :app:assembleDebug
python3 tools/build_release.py app/build/outputs/apk/debug/app-debug.apk
```

Do not use `tools/build_release.py` with an unbuilt source archive or placeholder bytes. It refuses APKs that lack `AndroidManifest.xml`, `classes.dex`, and a v1 JAR signature file.

## Host-side tests

Once the coverage-comment workflow is merged onto the default branch, PR quality runs post or update one **Code coverage** comment with separate Java/Python line and branch badges, measured percentages, the 85% targets, and report links. The comment refreshes as each language's run completes. Missing reports are marked unavailable, and results from older commits cannot replace current results. The reporter runs trusted default-branch code and reads report artifacts without executing PR code. Its first installation PR will not receive automatic comments until this workflow is on the default branch.

Pull requests run the **Python quality** workflow (unit tests, separate 85% line/branch gates, and module maintainability index >60) and **Java tests and coverage** workflow (JUnit/Robolectric with JaCoCo XML/HTML reports). Java coverage enforces separate 85% line and branch minimums across all production Java classes. See the [coverage measurements](JAVA-COVERAGE.md) for the baseline, improvements, scope, and remaining gaps. Radon maintainability scores apply to Python only. Reports are downloadable from each workflow run.

```shell
bash tests/run_tests.sh
```

These verify the Python USB importer (including preservation of Windows data-folder aliases), builder, Java package scanner, operation coordinator, installed-package query handling, package/result presentation, and launcher shell syntax. They do not emulate the actual Gen5W OS or validate head-unit audio/video functionality.

Android UI smoke tests run separately under Robolectric with API 19, including readable result text under a light OEM-style theme, confirmation/cancel behavior, scrolling long output in landscape, and package list selection/actions:

```shell
bash gradlew -p tests/ui --no-daemon jacocoTestReport jacocoTestCoverageVerification
```

These tests use simulated Android views, not a vehicle. The Actions workflow runs them before building the APK.

In PowerShell, replace `bash gradlew` with `.\gradlew.bat`. See the [local validation checklist](../CONTRIBUTING.md#local-validation) for the Python formatting, coverage, maintainability, and Node workflow-script checks required by CI.

## Manual hardware smoke test

1. Confirm NEMESIS Manager itself works.
2. Plug in USB with only the package manager and an empty `packages/` directory. Verify the app opens.
3. Add a small known-safe test package in `packages/Hello/`. Verify discovery and `pkg-info`.
4. Test Install -> Launch -> Uninstall (with explicit confirmation) and verify package registry changes.
5. Verify `packages/Hello/data/` persists after uninstall, and that the USB root descriptor does not change.
6. Import an official USB-ready package with nested `NEMESIS.data`. Verify it is detected but **do not install firmware-patching packages as part of this smoke test**.
7. Check each package's compatibility requirements before installation.
8. During a test package operation, close and reopen this app. Verify that another operation cannot start and that the completed result is shown. Do not use NEMESIS Manager to start a competing operation.
9. With the NEMESIS command channel unavailable in a controlled test environment, verify that the app displays the registry error and unavailable installed state. Restore the channel and tap Refresh to recover.
10. Verify that list rows show each name once, selection survives Refresh, and Details exposes the full source path. Check the Install/Update/Run script label for each entry type.
11. Check successful install and uninstall popups on the head unit: the summary must be readable, name the selected package, and explain the outcome. Open Details and scroll long output. Cancel a confirmation and verify that no operation starts.

## Known limitations

- The Android UI and USB read permissions are not hardware-tested.
- This build does not implement version comparisons, dependencies, conflict resolution, or automated batch installations.
- Android framework availability and permissions vary by Gen5W firmware; the first unit test is required to establish compatibility.
- A v1-signed debug APK is for development. Keep the signing key stable for future updates or you may need to uninstall before installing a differently signed APK.
