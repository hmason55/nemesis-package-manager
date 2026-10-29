# Security policy

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/hmason55/nemesis-package-manager/security/advisories/new) to send a confidential report to the maintainers. You need a GitHub account. Do not post exploit details, sensitive logs, or proof-of-concept packages in public issues or pull requests.

If the private reporting form is unavailable, open an issue titled "Private security reporting unavailable" asking the maintainer to enable it. Include no vulnerability details or attachments; wait for a private reporting channel before sharing them.

Include:

- The affected release version or commit and relevant component.
- Reproduction steps and a minimal proof of concept using disposable test files.
- Expected and actual behavior, impact, and any prerequisites.
- Whether the result was observed on a host, simulated Android, or actual hardware; include Android/firmware versions if relevant.
- Any suggested fix or workaround, if known.

Remove credentials, VINs, personal paths, recordings, and other private data from reports. Test only systems and files you own or have permission to test. Prefer isolated host fixtures to vehicle testing.

## Supported versions and scope

Development prereleases are experimental. Security fixes are targeted at `main` and the next release; older prereleases have no guaranteed backports. Any stable support window will be documented with that release. Report suspected issues in any version and identify the version you tested. No response-time or fix-time guarantee is offered.

Reports concerning archive extraction, path validation, unintended command execution, confirmation bypasses, data loss, and release tooling are relevant. NEMESIS and third-party packages have their own maintainers; report issues originating there to those projects privately and explain any impact on Package Manager.

NEMESIS intentionally executes approved package hooks and scripts with root privileges. Package Manager is not a sandbox for untrusted packages. A report should explain how behavior exceeds the intended package operation or bypasses the user's authorization.

## Coordinated disclosure

Maintainers will use the private report to discuss reproduction, impact, and a fix. Please coordinate publication of exploit details with them so users can update first. Credit preferences can be included in the report. This project does not offer a bug bounty.
