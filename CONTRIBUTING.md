# Contributing

Keep changes focused, explain the user-visible problem, and include evidence that the resulting behavior works. Open ready-for-review pull requests against `main`; do not open draft PRs. Use the GitHub plugin when contributing through Codex, as required by this project's agent instructions.

## Quality targets and current enforcement

The contribution targets are a **maintainability index greater than 60** and **at least 85% line coverage and 85% branch coverage** for production code. Line and branch coverage are separate requirements; a combined percentage is not sufficient. Report Java and Python separately so one language cannot hide gaps in the other.

These are the requested standards, not a claim about the current baseline. The existing CI runs host tests, Android API 19 UI smoke tests, the APK build, and bundle generation. Reliable coverage enforcement, maintainability gates, and automatic tagged releases remain pending implementation. Do not describe a passing existing build as evidence that the numeric targets have been met.

For each code-changing PR, record the measured baseline and resulting metrics, tool versions, scope, and any remaining shortfall. If tooling cannot measure the code correctly, report the limitation and fix the measurement before claiming compliance. Do not lower thresholds or exclude difficult production code to obtain a passing number. Existing gaps should be identified explicitly and reduced by meaningful tests and refactoring.

## Local validation

Use Java 17+, Gradle 8.10.2, Android SDK platform 35, and Python 3.8+ as described in [build and test notes](docs/BUILD-AND-TEST.md). Production Android code must remain compatible with Java 7 syntax and Android 4.4/API 19. Run commands from the repository root:

```sh
bash tests/run_tests.sh
gradle -p tests/ui --no-daemon test
gradle --no-daemon :app:assembleDebug
python3 tools/build_release.py app/build/outputs/apk/debug/app-debug.apk
```

The shell test runner needs Bash, Python 3, `javac`, and `java` on PATH. On Windows, use Git Bash for the shell command, or run its component checks explicitly. Never substitute a fixture APK for the real Android build when validating an installable release.

Python metrics can be inspected in a development virtual environment with pinned versions:

```sh
python3 -m pip install coverage==7.6.12 radon==6.0.1
python3 -m coverage run --branch --source=tools -m unittest discover -s tests -p 'test_*.py'
python3 -m coverage json -o coverage.json
python3 -m coverage report -m
python3 -m radon mi tools -s
```

Coverage.py's headline percentage combines statements and branches. Use its JSON report to calculate line coverage from covered/executable statements and branch coverage from covered/total branches separately. Count unimported production modules through an explicit source scope. Radon's letter grade alone is not sufficient: compare the numeric index against greater than 60 for each production Python module.

Java coverage should use JaCoCo with JUnit/Robolectric once that integration is reliable. Existing standalone Java test mains must be included in the measurement or wrapped in JUnit tests; running them outside the coverage agent does not contribute to the Java report. Account for Robolectric's class loading and instrumentation before trusting zero or missing coverage. Upload human-readable and machine-readable reports. A Java maintainability tool and formula must be documented and reproducible before enforcing the same numeric target; Radon measures Python and must not be presented as a Java metric. Until that tool is selected, report Java maintainability as unmeasured.

## Tests that demonstrate behavior

- Add regression tests that fail for the original bug and pass with the fix. Assert outcomes, not implementation details or private method call sequences.
- Cover success, failure, invalid input, boundary values, and alternate branches. Use isolated temporary directories; never use a real USB drive for unit tests.
- Test descriptors, ZIP layouts, path containment, case aliases, preserved data, malformed archives, and failed writes for file tooling.
- Test CLI failures, empty output, installed/unknown/locked states, activity recreation, cancellation, and operation ownership for Android changes. Inject command and filesystem boundaries where needed instead of issuing privileged vehicle commands from tests.
- Use Robolectric for Android view behavior, including light/dark theme contrast, readable result summaries, list selection, and scrollable dialogs. Keep fixtures deterministic and avoid arbitrary sleeps.
- Keep vehicle smoke tests separate from unit tests. State exactly what was simulated and what was tested on hardware; do not infer firmware compatibility from host tests or coverage.

Use all production Java and Python code as the default coverage scope. Any generated-code exclusion must be narrow, justified, and reviewed. Missing coverage is a reason to improve test seams and design, not to add no-op assertions or blanket coverage suppression.

## Language and design standards

### Java and Android

Use descriptive names, small cohesive classes, and explicit ownership of background work. Keep parsing, command execution, persistence, and presentation separable so they can be tested independently. Prefer clear control flow and early validation over deeply nested conditions. Avoid compressed multi-statement lines in new or refactored code.

Keep filesystem and CLI work off the UI thread. Use application context for long-running work, release resources in `finally`, and prevent callbacks or dialogs from acting on destroyed activities. Preserve the distinction between a failed registry query and a successful empty result. Give the user a readable outcome and a way to inspect diagnostic details. Do not add APIs or library dependencies incompatible with API 19.

### Python

Follow PEP 8 naming and layout. Keep CLI argument parsing in a `main()` function with an `if __name__ == '__main__'` guard. Separate archive inspection, validation, filesystem mutation, and presentation. Use context managers, explicit text encodings, and specific exceptions. Catch exceptions only where a useful recovery or actionable error can be provided. Prefer standard-library facilities and document any new dependency.

### Workflows and shell

Keep jobs small and permissions scoped to what each job needs. Treat PR titles, commit messages, branch names, and archive contents as untrusted input; pass values through structured APIs or environment variables rather than interpolating them into shell code. Pin tool versions, surface failures, and retain test/metric reports for review. Avoid secrets in logs and make retries safe.

## Package and data contracts

Continue to delegate package operations to NEMESIS. Require explicit confirmation for privileged actions. Preserve USB installers and user data, validate paths before extraction or execution, and keep the normal USB root descriptor stable. Do not claim that this app's operation coordinator locks the separate NEMESIS UI. Document any change to package layouts, output locations, or update behavior in the same PR.

## Release requirements

The intended pipeline publishes a release after an update to `main` **only after all quality checks, tests, APK build, and bundle validation succeed**. This automation has not yet been implemented; current Actions artifacts are not GitHub Releases.

A release implementation must:

1. Select a unique, deterministic version and tag the exact tested commit. Keep the Android version name/code and package manifest version consistent with that release. Never move an existing release tag to another commit.
2. Publish the validated USB-ready and internal installer ZIPs, with checksums and an explicit description of what each download is for. Clearly identify development/debug signing and preserve the established signing identity for updates where possible.
3. Include a short user-facing summary of changes since the preceding release, linked PRs where available, and relevant compatibility or upgrade instructions. Copying USB files alone does not update an already-installed manager; link the [explicit update procedure](docs/SETUP-WINDOWS.md#e-update-usb-package-manager-itself).
4. Make reruns idempotent: verify existing tag/commit identity and avoid duplicate releases or silently replacing published assets. Ensure concurrent runs cannot publish mismatched versions and artifacts.
5. Grant release-write permission only to the publication job. Never publish from a pull-request run or an unvalidated build.

## Pull request checklist

- Explain the concrete problem, resulting behavior, and any compatibility/data implications.
- Keep the diff focused and update user-facing docs with changed behavior.
- Include the commands run, outcomes, and test environment; disclose any checks not run.
- Report line coverage, branch coverage, and maintainability evidence separately, including scope and tooling limitations. Identify any unmet target explicitly.
- Add meaningful regression tests and keep existing tests passing.
- Confirm that secrets, local paths, recordings, compiled outputs, and metric reports are not accidentally committed.
- For release-workflow changes, test version selection, failed-check handling, tag collisions, reruns, and release-note generation without publishing a test release to users.
