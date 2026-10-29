# Release channels, signing, and stable publication

Pushes to `main` produce **development prereleases**, named
`<base>-build.<workflow-run-number>`. They are experimental debug-signed builds,
not declarations that the app is stable. Find them on the repository's
[Releases page](https://github.com/hmason55/nemesis-package-manager/releases).
New development prereleases do not become GitHub's latest stable release.
Older downloads created before this policy may still have legacy release flags;
their experimental/debug-signing notes remain authoritative.

Pull requests and ordinary manual runs validate and build artifacts without
publishing. Every release waits for Python tests/coverage/maintainability, Java
tests and separate coverage gates, the verified APK/bundles, and both standalone
companion builds. Reusable jobs check out and report the selected exact commit.
The publisher rejects unsuccessful, skipped, cancelled, missing, or stale results
before creating a tag. It never substitutes a previous run's successful check.

## Stable release prerequisites

Stable publication is deliberately unavailable until issues
[#30](https://github.com/hmason55/nemesis-package-manager/issues/30),
[#31](https://github.com/hmason55/nemesis-package-manager/issues/31), and
[#32](https://github.com/hmason55/nemesis-package-manager/issues/32) are closed as
**completed**. Closing an issue as not planned does not satisfy the gate. These
cover hardware qualification, persistent signing/upgrade evidence, and release
quality gates. Do not close them merely to bypass publication checks.

The signing infrastructure is implemented, but no production keystore has been
selected or installed by this change. Hardware validation is still required.
Use [the qualification record](HARDWARE-VALIDATION.md) to collect actual results.

## Configure persistent signing

Keep the release keystore under maintainer control, outside this repository,
with an independent encrypted backup and a documented recovery/custody process.
Do not reuse a disposable CI debug key as an unexamined production identity.
Never put keystore bytes, passwords, or private keys in issues, logs, or downloads.

Configure these **repository Actions secrets** through GitHub Settings:

| Secret | Value |
| --- | --- |
| `NEMESIS_KEYSTORE_BASE64` | The existing release keystore encoded as a single uninterrupted base64 string. |
| `NEMESIS_STORE_PASSWORD` | Keystore password. |
| `NEMESIS_KEY_ALIAS` | Release signing alias. |
| `NEMESIS_KEY_PASSWORD` | Password for that alias. |

Set the **repository Actions variable** `NEMESIS_SIGNING_CERT_SHA256` to the
expected public certificate SHA-256 fingerprint (64 hexadecimal digits;
colon-separated fingerprints are accepted). Verify it independently against
the retained keystore. Record the public fingerprint with the release evidence.

Stable builds stage the keystore only in runner temporary storage, export only
its filename, and remove that file in an `always()` cleanup step. Secrets are
supplied only to stable signing steps, never PR/development builds. Missing or
partial settings stop release assembly; there is no unsigned/debug fallback.
The Gradle release build is non-debuggable and enables APK v1/JAR signing for
Android 4.4, as well as v2 signing for compatible newer systems.

Before closing #31, run two independent CI builds with the retained identity,
compare public fingerprints, and verify the actual NEMESIS upgrade path on a
supported head unit. Local tests with disposable keys prove the tooling only.

### Local signed candidate

Supply `NEMESIS_KEYSTORE_PATH`, `NEMESIS_STORE_PASSWORD`, `NEMESIS_KEY_ALIAS`, and
`NEMESIS_KEY_PASSWORD` through your local environment or secret manager, then run
`gradlew :app:assembleRelease`. Do not pass passwords as command-line literals.
For an exact candidate, also set `NEMESIS_RELEASE_VERSION` and
`NEMESIS_VERSION_CODE`. `assembleDebug` remains available without signing secrets.

## Publish a stable candidate

1. Finish the qualification and signing prerequisites and merge the release
   changes. Select a full 40-character commit SHA that belongs to `main` and
   contains this release/signing infrastructure.
2. In **Actions > Build Package Manager > Run workflow**, select `main`, enter
   a clean numeric version such as `1.0.0` in `stable_version`, and enter the
   selected SHA in `candidate_sha`. Leaving the version empty never publishes.
   Repository maintainers control workflow dispatch; optionally protect this
   further with repository/environment approval rules.
3. The workflow revalidates and builds that commit with the final stable version
   before publication. Python, Java, APK, and Windows/Linux jobs use that same
   SHA. The production certificate fingerprint and APK/NEMESIS versions must
   match. Readiness is checked again immediately before publication.
4. Only after every gate passes does the workflow publish the exact validated
   bytes as `v<version>` and mark the release stable/latest. A new stable version
   must be newer than existing clean stable versions.

All channels use `1000 + Build Package Manager run_number` as the Android
version code, independent of the base version. Rerunning the same workflow run
keeps that value. New dispatches get a higher code; keep this workflow's identity
and counter when maintaining release automation. Never replace an existing tag
with a rebuilt artifact or reuse its version for another commit.

Downloads include the two NEMESIS ZIPs, Windows and Linux companion archives,
`release-evidence.json`, and `SHA256SUMS`. Evidence records the selected commit,
version/code, certificate fingerprint, verified APK hash, and bundle hashes.
The workflow verifies the actual APK using SDK `apksigner` and `aapt`, checks v1
signing/API 19 compatibility, and compares both nested bundles to those bytes.
Uploads stay in a draft until complete. Retries verify existing tag/asset identity
and never silently alter a published release or add a missing published asset.

## Upgrade and signing migration

Use [NEMESIS's external installer procedure](UPDATING.md#update-package-manager)
to update Package Manager. It cannot update itself. Copying files in the
companion only replaces the USB installer.

Development/debug and production signing identities are different. Android
normally rejects an in-place APK update signed by another identity. Compare the
installed build's public fingerprint with the candidate before planning an
upgrade; a version increase alone does not establish compatibility. Existing
debug-signed releases cannot be assumed to share one persistent key.

If the old signing key is unavailable, document and validate a one-time migration:
back up required app settings and exports, keep independent copies of the USB
packages/data, remove the old manager through NEMESIS Manager, and install the
new signed manager through NEMESIS. Uninstalling may remove Android-private app
data. Do not promise automatic preservation of those settings. Subsequent stable
upgrades must retain the production key and use increasing version codes.
