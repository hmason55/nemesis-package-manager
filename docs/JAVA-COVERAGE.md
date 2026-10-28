# Java coverage measurements

Measured on Windows with Microsoft OpenJDK 17.0.21.0.2, Gradle 8.10.2, JaCoCo 0.8.12, JUnit 4.13.2, and Robolectric 4.9.2 running Android API 19. The baseline is commit `ab808549c370b1ed9337193da0c1d5943b4017ee`.

| Metric | Baseline | With the new tests | Required minimum |
| --- | --- | --- | --- |
| Line coverage | 394/648 (60.80%) | 602/654 (92.05%) | 85% |
| Branch coverage | 248/558 (44.44%) | 481/558 (86.20%) | 85% |

Both runs used the same environment and all production Java sources under `app/src/main/java`, including Android activities and dialogs. No production class or branch was excluded to meet the thresholds. The additional production lines provide package-private command/process injection for deterministic tests; production callers retain the existing executable, arguments, and behavior.

## Reproduce

Use JDK 17 and run from the repository root:

```sh
bash gradlew -p tests/ui --no-daemon clean jacocoTestReport jacocoTestCoverageVerification
```

Read the root `LINE` and `BRANCH` counters in `tests/ui/build/reports/jacoco/test/jacocoTestReport.xml`. Calculate each percentage as `covered / (covered + missed) * 100`; do not average class percentages or combine lines and branches. The HTML report is in the same directory. CI retains XML, HTML, and test results as the `java-quality-reports` artifact and enforces both minimums through `jacocoTestCoverageVerification`.

## Behavior exercised

- Process arguments, output truncation with continued draining, exit status, and command-start/read failures.
- Install/update metadata, lock protection, source ZIP contents, preserved data, cleanup after errors, unreadable sources, and excessive nesting.
- Script path quoting and rejection of unsafe shell characters.
- Parser limits, invalid descriptors, ambiguous ZIP metadata, path validation, and discovery noise.
- Registry failure/recovery, selection retention, cancel/confirm actions, service/locked packages, operation results, and saved history.
- Update-result retries and interrupt restoration, presentation fallbacks, and dialog actions.

Commands and USB locations are replaced at test boundaries for activity tests; pure Java tests exercise the real process-output and archive logic with temporary files and simulated processes. These checks do not run privileged vehicle commands or establish firmware compatibility. Manager self-update handoff, platform-specific filesystem failures, and several activity lifecycle/error branches remain partly uncovered; consult the HTML report before selecting the next tests.

Java maintainability remains unmeasured because no reproducible Java maintainability tool/formula has been selected. Python code and its coverage/maintainability measurements are unchanged by this work.
