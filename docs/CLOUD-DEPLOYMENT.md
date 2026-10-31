# Cloud deployment status

For the live-search, package-artwork and publisher-block update, apply D1 migration `0003_publisher_blocks_icons.sql` before deploying the new Worker. It adds only a blocklist table and nullable icon key; existing package versions and ZIP bytes are unchanged. Deploy the updated trusted validator from merged `main` before testing a new ZIP containing artwork. Pages publishes the matching website. An older Worker cannot expose the new Settings/management capabilities by itself.

Staging was provisioned and tested on 2026-10-30 using authenticated Wrangler.
Production has not been provisioned; complete the staging publishing and client
acceptance checks before creating production resources.

| Resource | Staging value |
| --- | --- |
| Worker API | `https://nemesis-registry-staging.hmason55.workers.dev` |
| Worker name | `nemesis-registry-staging` |
| D1 database | `nemesis-staging` |
| D1 database ID | `b0d9022d-83bd-4daf-bc9d-968521d4aa26` |
| Private R2 bucket | `nemesis-packages-staging` |
| Scheduled processing | Every ten minutes |
| Registry administrator GitHub ID | `18219788` |
| GitHub App | `nemesis-registry-staging` |
| GitHub App ID | `5545234` |
| GitHub App client ID | `Iv23liwVeSh326CoqlRW` |

Both migrations (`0001_registry.sql` and `0002_multipart.sql`) are applied.
No demo packages were seeded. R2 public access through `r2.dev` is disabled;
downloads are served through the Worker's approval checks.

`GITHUB_WEBHOOK_SECRET`, `SESSION_ENCRYPTION_KEY`, and `VALIDATOR_TOKEN` are
configured as Worker secrets. Their local recovery backup is outside the
repository at `%LOCALAPPDATA%\NEMESIS\registry-staging.secrets.json`, encrypted
using Windows DPAPI for the current Windows user. It contains no plaintext
secrets and cannot be used by a different Windows account as a portable backup.

From the repository root, copy the webhook secret without printing it:

```powershell
.\registry\scripts\copy-staging-secret.ps1
```

For the later GitHub `registry-staging` environment secret
`REGISTRY_VALIDATOR_TOKEN`, copy the existing matching value:

```powershell
.\registry\scripts\copy-staging-secret.ps1 -Name VALIDATOR_TOKEN
```

## Live verification

- Public catalog returned HTTP 200 with an empty catalog.
- CORS allowed the GitHub Pages origin `https://hmason55.github.io`.
- Unsigned webhook requests returned HTTP 401.
- A correctly signed test ping returned HTTP 202.
- Repeated delivery IDs were recognized without processing again.
- Unauthenticated publisher access returned HTTP 401.
- After App credential configuration, sign-in start returned HTTP 302 to GitHub
  with the configured App client ID. Full browser authorization remains to test.

Registry TypeScript/schema checks and all 24 Worker/key-conversion tests passed
before deployment. Full GitHub authentication and publishing are pending testing;
these checks do not constitute an end-to-end publishing or vehicle validation.

## Finish GitHub setup

Use these values in the staging GitHub App:

- Callback: `https://nemesis-registry-staging.hmason55.workers.dev/auth/callback`
- Webhook: `https://nemesis-registry-staging.hmason55.workers.dev/webhooks/github`
- Homepage: `https://hmason55.github.io/nemesis-package-manager/`
- Setup URL: `https://hmason55.github.io/nemesis-package-manager/#publish`

The GitHub App has been created and its App ID, client ID, and slug are configured
in the staging Worker variables. Its OAuth client secret and converted PKCS#8
private key are deployed as Worker secrets. The private key was read from the
App's downloaded PEM in the owner's Documents directory and piped directly to
Wrangler; it was not copied into the repository or printed.

The owner confirmed installation on `hmason55/nemesis-package-manager`.
Additional public publisher repositories can be selected through the App's
installation settings. Test website sign-in once the Pages deployment is
available.

The `GITHUB_DISPATCH_TOKEN` secret is configured and deployed at 100% traffic
in Worker version `965a60d6-659b-4e02-96b7-cf24add37302`. Token permissions and
actual workflow dispatch remain to test once the workflow exists on GitHub.
The GitHub validation environment and Pages settings cannot be inspected using
the available connector; their configuration remains to be verified.

The local workflows and site must reach
`main` before GitHub can deploy them; both registry deployment workflows were
confirmed absent from remote `main` after App installation. Follow [the setup checklist](CLOUD-SETUP-CHECKLIST.md)
for the remaining account-owner steps. Keep credentials out of chat and website
assets.

## Publishing policy update

The implementation now supports automatic publication after trusted validation
for GitHub-authenticated publishers with repository write/maintain/admin permission
and the required App installation. There is no mandatory maintainer approval step.
Admin report/retry/rejection/withdrawal controls remain available. Deploy the updated
Worker and website together before claiming this new policy is live; the historical
resource and smoke-test record above does not establish a new deployment.
