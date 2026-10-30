# Cloud implementation validation — October 30, 2026

This records local validation of the cloud implementation on top of the existing
working tree. It is not a deployment record or a head-unit compatibility claim.

## Current-main PR validation

The PR is based on GitHub main commit
`d49c9822f653a9e6f3593c0de52cda89e0c93fd3`. Its newer release safeguards,
saved installed-version state, and Companion contextual controls are retained.
Cloud imports share a drive mutation lock with selection, deletion, launcher
changes, and manual imports. Network downloads remain outside that lock.

| Check | Current main baseline | Cloud PR |
| --- | --- | --- |
| Python tests | 77, one capability skip | 98, same skip |
| Python line coverage | 94.19% | 93.93% |
| Python branch coverage | 91.67% | 90.17% |
| Minimum Python maintainability index | 60.33 | 60.56 |
| Java/API 19 tests | 47 | 64 |
| Java line coverage | 94.07% | 93.91% |
| Java branch coverage | 87.53% | 85.30% |

All production Python modules in `tools` and `.github/scripts` are measured;
JaCoCo measures all production Java classes without new exclusions. Both 85%
coverage gates pass. Java maintainability remains unmeasured.

The combined candidate also passed TypeScript/OpenAPI checks, 26 Worker tests,
one private-key conversion test, ten website tests, website production build,
dependency audit (zero vulnerabilities), Python formatting, 22 release/workflow
Node tests, APK compilation, and Windows PyInstaller build/authenticated smoke.
The Linux executable build remains a GitHub Actions check. These are host and
simulated Android results; no physical head-unit installation was performed.
See [deployment status](CLOUD-DEPLOYMENT.md) for the separately provisioned staging
Worker. Full browser OAuth and publisher-to-client validation remain pending
the website and trusted workflow reaching main.

## NuGet-style website and deployment follow-up

The follow-up adds search facets and sorting, package/version routes, package
information tabs, guided publishing, light/dark themes, and multipart ingestion.
Worker tests now cover the R2 multipart assembly path, per-part checksums,
incomplete uploads, and upload identity restrictions. Website tests exercise
keyboard tabs, associated labels, version bookmarks, and the review-before-submit
publisher flow. The OpenAPI contract is validated during `npm run check`.

| Follow-up check | Result |
| --- | --- |
| Worker tests | 23 passed, plus one private-key conversion test |
| Website tests | 10 passed |
| Website TypeScript / production build | Passed |
| Browser accessibility scans | No automated WCAG A/AA violations on catalog, package details, help, signed-out publishing, or the three publisher steps using controlled fixtures |
| Responsive browser checks | 1280 px desktop and 390 px mobile; light/dark themes; no horizontal overflow on tested mobile pages |
| Python tests | 76 tests, one filesystem capability test skipped |
| Python line / branch coverage | 94.73% / 91.81% |
| Python maintainability | Every production module above 60 |
| Dependency audit | Zero reported vulnerabilities |

Accessibility results describe the tested states and do not substitute for a
complete manual accessibility audit. Browser publisher data and GitHub provider
responses are fixtures; live authentication still requires the account setup in
CLOUD-SETUP-CHECKLIST.md. The Java/APK and Windows companion results below are
from the initial implementation; native application code was unchanged in this
follow-up. Those initial checks preceded cloud provisioning; staging has since
been deployed as recorded in CLOUD-DEPLOYMENT.md.

## Initial implementation validation

| Check | Result |
| --- | --- |
| Worker runtime tests with local D1/R2 | Passed: authorization, OAuth state/PKCE handoff and replay rejection, validation-to-review ingestion, approval/withdrawal, ownership and version conflicts, ETags, webhooks |
| Website TypeScript and production build | Passed |
| Browser inspection against local Worker | Passed: responsive styled catalog, package details, compatibility text, and Worker download URLs; development fixture only |
| Python suite | 73 tests, one Windows filesystem capability test skipped |
| Python line / branch coverage | 94.58% / 91.72% |
| Python maintainability | Every production module above 60; minimum 60.27 |
| Java/API 19 suite | 59 tests passed |
| Java line / branch coverage | 1009/1077 (93.69%) / 851/998 (85.27%) |
| Java coverage enforcement | Both existing 85% gates passed; no production classes excluded |
| Android APK | Built with JDK 17, Java 7 source/target, minimum API 19 |
| Windows companion executable | PyInstaller build and authenticated packaged UI/API smoke test passed, including cloud UI asset |
| Existing release/workflow Node tests | Eight passed |
| Node dependency audit | Zero reported vulnerabilities |

Tools: Python 3.12.14, coverage.py 7.6.12, Radon 6.0.1, Ruff 0.9.10,
Node 24.14.1, Vitest 4.1.12, Wrangler 4.156.0, Gradle 8.10.2,
JaCoCo 0.8.12, JUnit 4.13.2, Robolectric 4.9.2, PyInstaller 6.22.3.
Java maintainability remains unmeasured, as documented in JAVA-COVERAGE.md.

Reproduce with the commands in CLOUD-REGISTRY.md and the existing build/test
guides. Python's separate line/branch figures come from `coverage.json`, and Java
figures from `tests/ui/build/reports/jacoco/test/jacocoTestReport.xml`. Reports and
binaries are local build artifacts, not committed release publications.

Still required before production rollout:

- Verify the staging GitHub environment and Pages settings, and publish the
  trusted validation workflow on main. Provision production only after staging.
- Run real GitHub release intake, moderation, and Cloudflare delivery in staging;
  GitHub requests in local automated tests use controlled provider responses.
- Build/smoke-test the standalone companion on Linux through the existing matrix.
- Verify TLS/certificate trust, available storage, private-cache access, and a
  confirmed NEMESIS installation without USB on the actual head unit. No
  privileged vehicle installation was attempted by local tests.

The initial validation did not publish a release. Cloud provisioning and PR
validation are recorded separately above and in CLOUD-DEPLOYMENT.md.

Review follow-up regression checks cover canonical URL encoding shared by all
three clients, concurrent package-ID casing claims, terminal release-sync events,
USB folder defaults for every supported ID shape, and source-specific search.
The cloud outage test also verifies installed state remains available.
