# Build and test notes

This project targets Android API 19 (Android 4.4). The Android app has no dependency on Google Play Services. It calls NEMESIS's `/system/xbin/nemesis` via its documented command channel.

## Automated GitHub Actions build

The workflow `.github/workflows/build.yml` uses Java 17, Gradle 8.10.2, and AGP 8.7.3. Push the repository to `main`, or launch the workflow manually. It runs host tests, builds `app-debug.apk`, checks its expected structure and JAR signature, creates the NEMESIS ZIP, and uploads `dist/` as an artifact.

## Local build

Install Java 17+, Android SDK platform 35/build tools, and Gradle 8.10.2. Accept SDK licenses. Then:

```shell
gradle --no-daemon :app:assembleDebug
python3 tools/build_release.py app/build/outputs/apk/debug/app-debug.apk
```

Do not use `tools/build_release.py` with an unbuilt source archive or placeholder bytes. It refuses APKs that lack `AndroidManifest.xml`, `classes.dex`, and a v1 JAR signature file.

## Host-side tests

```shell
bash tests/run_tests.sh
```

These verify the Python USB importer and builder, the Java package scanner, and launcher shell syntax. They do not emulate the actual Gen5W OS or validate head-unit audio/video functionality.

## Manual hardware smoke test

1. Confirm NEMESIS Manager itself works.
2. Plug in USB with only the package manager and an empty `packages/` directory. Verify the app opens.
3. Add a small known-safe test package in `packages/Hello/`. Verify discovery and `pkg-info`.
4. Test Install -> Launch -> Uninstall (with explicit confirmation) and verify package registry changes.
5. Verify `packages/Hello/data/` persists after uninstall, and that the USB root descriptor does not change.
6. Import an official USB-ready package with nested `NEMESIS.data`. Verify it is detected but **do not install firmware-patching packages as part of this smoke test**.
7. Check compatibility with the existing RearDashcam/Leafia packages only after basic operations work.

## Known limitations

- The Android UI and USB read permissions are not hardware-tested.
- This build does not implement version comparisons, dependencies, conflict resolution, or automated batch installations.
- Android framework availability and permissions vary by Gen5W firmware; the first unit test is required to establish compatibility.
- A v1-signed debug APK is for development. Keep the signing key stable for future updates or you may need to uninstall before installing a differently signed APK.
