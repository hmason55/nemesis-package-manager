# Release channels and stable publication

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

## Version 1.0 candidate

The 1.0 documentation targets stable version **`1.0.0`**. Merge the documentation
PR, select the final `main` commit, and validate it with `stable_version=1.0.0`
and `candidate_sha` set, leaving **publish_stable** unchecked. Review its quality,
signing, artifact, and hardware evidence before explicit stable publication.
The documentation PR alone does not publish a release or establish new vehicle
or cloud compatibility. Local source defaults and development versioning remain
independent of the selected stable candidate.

## Stable release prerequisites

Stable publication requires issue
[#32](https://github.com/hmason55/nemesis-package-manager/issues/32), which tracks
implementation of the quality gates, to be closed as **completed**. Every
selected commit must also pass the live quality and artifact checks.

## Release build configuration

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

To validate a signed candidate without publishing, run **Build Package Manager**
on `main` with `stable_version` and `candidate_sha` set and **publish_stable
unchecked**. Results are uploaded as workflow artifacts without creating tags or
releases.

### Local signed candidate

Supply `NEMESIS_KEYSTORE_PATH`, `NEMESIS_STORE_PASSWORD`, `NEMESIS_KEY_ALIAS`, and
`NEMESIS_KEY_PASSWORD` through your local environment or secret manager, then run
`gradlew :app:assembleRelease`. Do not pass passwords as command-line literals.
For an exact candidate, also set `NEMESIS_RELEASE_VERSION` and
`NEMESIS_VERSION_CODE`. `assembleDebug` remains available without signing secrets.

## Publish a stable candidate

1. Merge the release changes. Select a full 40-character commit SHA that
   belongs to `main` and contains this release infrastructure.
2. In **Actions > Build Package Manager > Run workflow**, select `main`, enter
   a clean numeric version such as `1.0.0` in `stable_version`, and enter the
   selected SHA in `candidate_sha`. Explicitly check **publish_stable** to
   publish. Leaving it unchecked only validates a signed candidate; leaving the
   version empty never publishes.
   Repository maintainers control workflow dispatch; optionally protect this
   further with repository/environment approval rules.
3. The workflow revalidates and builds that commit with the final stable version
   before publication. Python, Java, APK, and Windows/Linux jobs use that same
   SHA. The production certificate fingerprint and APK/NEMESIS versions must
   match. The quality-gate prerequisite is checked again before publication.
4. Only after every gate passes does the workflow publish the exact validated
   bytes as `v<version>` and mark the release stable/latest. A new stable version
   must be newer than existing clean stable versions. Stable publication jobs
   share one concurrency group so simultaneous versions cannot race the latest
   release check. Publication also compares prior stable evidence: the retained
   certificate must match and the Android version code must increase. A delayed
   older candidate must be rebuilt in a new workflow run rather than retried
   after a newer-code stable release.

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

## Update the installed app

Use [NEMESIS's external installer procedure](UPDATING.md#update-package-manager)
to update Package Manager. It cannot update itself. Copying files in the
companion only replaces the USB installer.
