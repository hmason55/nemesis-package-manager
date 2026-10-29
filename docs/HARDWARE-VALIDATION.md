# Release candidate qualification record

This is a blank evidence template for
[#30](https://github.com/hmason55/nemesis-package-manager/issues/30), not a claim
that hardware validation has happened. Record **not run**, **pass**, or **fail**
for each case; never substitute simulated Android tests for a hardware result.

## Candidate and environment

| Field | Recorded value |
| --- | --- |
| Candidate version and exact commit | Not recorded |
| Download SHA256SUMS verified | Not run |
| APK certificate SHA-256 fingerprint | Not recorded |
| Vehicle/head-unit model and firmware | Not recorded |
| Android and NEMESIS versions | Not recorded |
| Desktop OS and packaged companion build | Not recorded |
| USB device, filesystem, and mount path | Not recorded |
| Tester and test date | Not recorded |

Repeat this record for each advertised hardware/firmware configuration and for
Windows x86-64 and supported Linux x86-64 companion environments. Attach it to
the issue or a reviewed qualification document with screenshots/logs as evidence.
Record the actual candidate; changes affecting the tested flows require retesting.

## Head-unit checks

| Case | Result | Evidence or failure issue |
| --- | --- | --- |
| Fresh manager install through NEMESIS | Not run | |
| External NEMESIS upgrade and signing compatibility | Not run | |
| Launcher disables its descriptor and manager reopens | Not run | |
| Discover and select a suitable community installer | Not run | |
| Install, launch, update, uninstall, and run a test script | Not run | |
| Installed versions and Updates membership are correct | Not run | |
| Manager is excluded from its own lists/actions | Not run | |
| Short-display list scrolling and operation overlay | Not run | |
| Confirmation cancel, success, and error details | Not run | |
| Reopen during work; competing actions remain blocked | Not run | |
| Read-only query failure and Refresh recovery | Not run | |
| USB installers, disabled descriptors, and data retained | Not run | |

Use suitable known-safe test packages in a parked vehicle. Do not deliberately
interrupt a live installation or start a competing NEMESIS action to test a
failure case. Record controlled read-only query failures instead.

## Desktop companion checks

| Case | Result | Evidence or failure issue |
| --- | --- | --- |
| Packaged executable starts without Python/Node installed | Not run | |
| Correct physical USB discovery/selection | Not run | |
| Fresh setup, manager replacement, and repair | Not run | |
| Separate-drive manager instructions work offline | Not run | |
| Community import/replacement and ID mismatch rejection | Not run | |
| Stale selection in another tab rejects the write | Not run | |
| Existing recordings, packages, and launchers retained | Not run | |
| Safe ejection and use of prepared drive in vehicle | Not run | |

Keep user data and signing secrets out of public logs. File separate blocking
issues for failures, link fixes, and record the candidate used for each retest.
Close #30 only when the supported configurations have complete, passing evidence;
otherwise narrow the advertised compatibility and keep the outstanding gaps open.
