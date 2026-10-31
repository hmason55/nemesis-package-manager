# Cloud registry: development, deployment, and operation

## Package artwork and publisher management

Publishing requires a GitHub account with permission to publish from the connected public repository. Every valid release publishes automatically after technical checks; there is no maintainer approval queue. Maintainers can **Remove package** to withdraw every public version and stop pending submissions, or **Block repository owner** to prevent new publishing from that GitHub identity and its repositories. The API also checks a blocked submitting collaborator. Blocking alone leaves existing releases available; remove those separately when appropriate. Removal disables registry downloads and icons but cannot recall copies already downloaded. Unblocking permits future submissions without silently restarting stopped validation jobs. Publish a new release asset or ask an administrator to recover a stopped job when retrying the same asset.

To add listing artwork, include an optional `icon.png` alongside `NEMESIS.data` inside the directly installable ZIP (including its supported common directory prefix). Use a still, non-interlaced PNG, at most **512 × 512 pixels** and **256 KiB**. The trusted validator checks PNG framing, CRCs, dimensions and bounded decompression, then copies the image into private hash-addressed R2 storage. Invalid supplied artwork fails validation; nothing executes. Public image URLs check the exact version's current publication status and stop working after withdrawal. Legacy releases without artwork use the publisher's GitHub avatar, with a local icon fallback if images cannot load. Existing approved ZIPs are never modified; add artwork in a new version.

The website's **Settings** page stores optional appearance and device-profile preferences locally. Normal browsing and publishing require no profile configuration. Search updates as users type; category, publisher, maximum latest-version download size and sorting apply before pagination.

The registry includes the GitHub Pages website (`website/`), Cloudflare Worker
(`registry/`), D1 migrations, a private R2 package store, trusted Actions
validation, and optional clients in both existing applications. The API contract
is `contracts/openapi.yaml`. Nothing in the local USB workflow requires it.

Account owners can start with [the step-by-step setup checklist](CLOUD-SETUP-CHECKLIST.md),
which separates manual account setup from work Codex can complete after login.

## Local development

Use Node 24, Python 3.12, JDK 17, and the existing Android SDK requirements.

```sh
npm ci
npm run check
npm test
npm run build
cd registry
npx wrangler d1 migrations apply nemesis-local --local
npm run dev
```

Run `npm run dev --workspace website` in a second terminal. Configure
`VITE_REGISTRY_URL=http://localhost:8787` in the website's local environment for
browser development. Native clients require HTTPS and do not accept this local
HTTP endpoint. Use a staging Worker for client integration tests.

Copy `registry/.dev.vars.example` to ignored `registry/.dev.vars` for local
authentication testing. GitHub callback URLs must exactly match the actual
Worker `/auth/callback` URL. Production and staging should use separate GitHub
Apps and secrets. Never put any secret in a `VITE_` variable.

## Provision staging and production

1. In Cloudflare, create separate D1 databases and private R2 buckets named as in
   `registry/wrangler.jsonc`. Replace each environment's D1 ID. Keep public R2
   access disabled. The Worker streams approved objects through its R2 binding.
2. Create a GitHub App for each environment. Request **Metadata: read** and
   **Contents: read** repository permissions, selected-repository installation,
   and user authorization. Leave **Request user authorization during installation**
   disabled: website sign-in establishes the OAuth state/PKCE transaction. Set
   the Setup URL to the website's `#publish` route. Subscribe to Release, Repository, Installation, and
   Installation repositories events. Set the callback and webhook URLs to
   `/auth/callback` and `/webhooks/github` on that environment's Worker.
3. Set non-secret Worker vars: `GITHUB_APP_ID`, `GITHUB_APP_SLUG`,
   `GITHUB_CLIENT_ID`, `ADMIN_IDS` (comma-separated numeric GitHub user IDs),
   `VALIDATOR_REPOSITORY`, `VALIDATION_ENVIRONMENT` (`staging` or `production`),
   and `SITE_URL`. The Pages site URL includes `/nemesis-package-manager/`.
4. Configure Worker secrets with `wrangler secret put NAME --env staging`
   (repeat for production): `GITHUB_CLIENT_SECRET`, `GITHUB_PRIVATE_KEY`,
   `GITHUB_WEBHOOK_SECRET`, `SESSION_ENCRYPTION_KEY`, `VALIDATOR_TOKEN`, and
   `GITHUB_DISPATCH_TOKEN`. Generate independent random values for the webhook,
   validator, and encryption secrets. The encryption key is 32 random bytes
   encoded as 64 hex characters. The private key must be PEM **PKCS#8**, not
   PKCS#1; convert the downloaded GitHub App key with
   `openssl pkcs8 -topk8 -nocrypt -in app.pem -out app-pkcs8.pem`.
5. The dispatch token is a dedicated fine-grained automation credential with
   **Actions: write** only on the trusted registry repository. It triggers the
   validation workflow on `main`; it has no publisher-repository write access.
6. Create GitHub environments `registry-staging` and `registry-production`.
   Each needs `REGISTRY_API_URL` as a variable and `REGISTRY_VALIDATOR_TOKEN` as
   a secret matching that Worker's validator token. Restrict the environments
   to `main`. Validation workflow code must be on the trusted default branch.
7. Apply migrations with `npx wrangler d1 migrations apply nemesis-staging
   --remote --env staging`, then `npm run deploy:staging --workspace registry`.
   Repeat with the production database and environment only after staging passes.
8. Set repository variable `REGISTRY_API_URL` to the production Worker HTTPS
   address. Enable GitHub Pages using **GitHub Actions**, then run **Deploy
   registry website**. No custom domain is needed. Website publication is manual;
   ordinary main pushes run checks without deploying the cloud components.

GitHub user tokens are encrypted in D1; registry bearer tokens are stored as
hashes. Browser bearer tokens stay in memory and expire after one hour. Reloading
the website requires sign-in again. OAuth handoff codes expire in 60 seconds and
require the originating browser verifier. Cookie-based cross-site API sessions
are not required. An API encryption-key change invalidates outstanding sessions.

## Publish automatically and manage releases

Install the GitHub App on a public repository, sign in, and register it with
redistribution consent. Write, maintain, or admin permission is required. Select
a release and installable ZIP and enter its **exact internal** NEMESIS ID and
version. The version need not be SemVer. ZIPs can have a root manifest or a
single enclosing directory; wrapper USB releases and executable descriptors are
not accepted. Limits are 512 MiB compressed, 3 GiB declared expansion, 20,000
members, and a 64 KiB package manifest. All members are read for CRC checks, but
no package hooks are executed.

Submission states are `queued → validating → approved`. The legacy `review`
status may appear briefly as **Finishing publication** while a validated artifact
is finalized; it is not an administrator queue. The validator completion normally
publishes immediately; scheduled processing retries/backfills validated legacy
review rows through the same safe publication checks. An authorized GitHub publisher
with repository write/maintain/admin permission and the required App installation
publishes automatically after trusted validation. No maintainer approval is required. A repository or publisher may have up to 20
active queued/validating/finishing jobs at a time; wait for jobs to finish before
submitting more. The reserved `usb.package.manager` identity remains on its
dedicated self-update workflow and cannot be published as a registry package.

Validation and authorization failures remain private. A failed validation can be
retried after its cause is resolved; a rejected asset requires a corrected release
asset/version. Automatic publication claims the global package ID for that
repository, rechecks exact ID casing/ownership, and never replaces published bytes.
Package descriptions and compatibility changes travel through the same validated
submission path. Withdrawal remains available for abuse or broken releases.

Validation uploads above 64 MiB use 8 MiB R2 multipart requests, avoiding the
Cloudflare request-body limit without changing the package size limit. The trusted
runner hashes the complete ZIP; the Worker verifies each part's checksum before
R2 assembly. Multipart ETags are never substituted for the package SHA-256.
Incomplete uploads are aborted on failure and stale sessions are cleaned on the
Worker schedule. Apply migration `0002_multipart.sql` along with the initial schema.

Release webhooks are durably queued and processed every ten minutes. A registered
repository with one package and exactly one ZIP can create a proposal
automatically; the release tag (without a leading numeric `v`) is checked against
the manifest by validation. Multiple packages/assets require manual selection in
the publisher portal. Drafts do not publish. Queued validation dispatches retry
on the schedule, and validation leases time out after an hour. Repository
transfers, installation removal, suspension, and privatization suspend publishing;
re-register after authorization is verified again. Previously approved R2 copies
remain available unless withdrawn.

An administrator configured by numeric GitHub ID uses **Manage registry** to
inspect reports, ownership, hashes and metadata, retry failed validations, reject
abusive pending submissions, and withdraw published versions. These are operational
and anti-abuse controls, not a required publication gate. Trusted validation plus
a hash establishes a byte/integrity match, not a publisher signature or a guarantee
that package code is safe.

## Configure clients

Companion uses the built-in staging registry by default. Open **Cloud registry**
and browse without configuring an address or signing in. **Settings → Registry HTTPS address → Save registry**
lets an operator select another HTTPS registry for the current session. Clearing
the address and saving disconnects cloud browsing. Startup makes no registry
request. An explicit empty CLI/environment override also disables the connection. Source and
standalone launchers also accept `--registry-url` or `NEMESIS_REGISTRY_URL` as
operator overrides. Manual imports and drive preparation work offline regardless
of registry connectivity.

Cloud preparation downloads to temporary computer storage, checks current
publication status and integrity, then uses the same importer and data-preserving
replacement as manual imports. Batch results are per package, not an all-or-nothing
transaction. Cancellation stops before the next USB publication; an already-running
directory swap finishes. Duplicate USB identities require an explicit destination.
Loose ZIPs remain view-only replacement targets.

On first launch in the vehicle, choose **Cloud Registry** or **USB Storage** and
press **Continue**. **Don’t show again on startup** saves the startup preference.
Open **Settings** to change the source, registry HTTPS address, or optional device
profile; use **Hide keyboard** or the keyboard's Done/OK action, then **Save**.
The browser has live **Search packages**, **Clear**, and type/sort **Filters**.
Installed management remains available offline. Each package ID has one browser
row; multiple releases open a version picker before Install/Update; **Details → Choose
version** also exposes versions for installed packages, including versions whose
ordering is unknown. Equal/older versions keep the existing no-downgrade behavior. Downloads are
bounded to a 512 MiB private installer cache, verified before confirmation, and
checked against current approval again before NEMESIS installation. Scripts stay
in USB mode. Compatibility requirements and device notes are advisory even when
they conflict; read the warning before confirming.

## Withdrawal, backups, and incident response

Withdraw a version in **Manage registry**. Fresh API discovery excludes it immediately;
metadata caches may retain it for up to 60 seconds. Its download endpoint checks
approval on every request and is not cached. Existing downloads/offline copies
cannot be recalled, and withdrawal does not uninstall anything on vehicles.

Before schema migrations export a private D1 backup:

```sh
npx wrangler d1 export nemesis-production --remote --env production --output backup.sql
```

Backups contain encrypted sessions and publisher information; store them privately.
For recovery create a replacement D1 database, import the backup with `wrangler d1
execute DATABASE --remote --file backup.sql`, bind staging to it, verify counts and
approved-version/R2 consistency, then switch production's binding. Keep matching
encryption secrets when restoring sessions, or delete sessions and auth tables to
force sign-in. R2 artifacts are immutable and separate from D1; retain independent
object backups and test recovery. Retain approved/withdrawn bytes for audit; unused
validation objects require deliberate cleanup after checking D1 references.

Structured logs record job, synchronization, and API errors without credentials or
OAuth query strings. D1 `audit` records moderation and publishing events. Invocation
request logging is disabled. Alert on recurring dispatch failures, validation
timeouts, missing R2 objects, and sustained API errors. Rotate automation credentials
and revoke sessions if compromised. A D1 read failure fails downloads closed.

## Release gate

Run Node checks/tests/build, Python and Java tests/coverage, API 19 UI tests, APK
build, and standalone companion smoke tests on Windows and Linux. Then verify a
real GitHub submission through trusted validation and automatic staging publication, companion download, and vehicle
installation. Real hardware must establish TLS 1.2/certificate verification,
available cache space, and NEMESIS access to the private cached ZIP **without USB**.
Never bypass certificate or hostname verification. Simulator/host tests alone do
not establish head-unit compatibility. Supply infrastructure/secrets and pass this
gate before advertising the service as deployed or production validated.
