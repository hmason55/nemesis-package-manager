# Your Cloudflare and GitHub setup

This is the account-owner checklist for `hmason55/nemesis-package-manager`.
The registry implementation and deployment workflows are on `main`. GitHub Pages
uses the dedicated website workflow; enabling Pages alone does not build the Vite
site. Check CLOUD-DEPLOYMENT.md for the separate infrastructure deployment record.

The GitHub connector can access the repository with admin permission, but its
available tools cannot change Pages settings, create GitHub Apps, manage secrets
or environments, or dispatch workflows. Cloudflare staging is now provisioned
using authenticated local Wrangler; see [deployment status](CLOUD-DEPLOYMENT.md).
Start with step 2 below. Production remains pending staging validation.

## 1. Sign in to Cloudflare and enable R2

Open [Cloudflare Dashboard](https://dash.cloudflare.com/). Create an account if
needed, then open **Storage & databases → R2 → Overview** and enable the R2
subscription. Complete Cloudflare's account/billing flow yourself. No custom
domain or Cloudflare Pages project is needed: the website uses GitHub Pages and
the backend uses `workers.dev`.

Then, in PowerShell:

```powershell
Set-Location 'C:\Users\Hunter\Documents\GitHub\nemesis-package-manager'
npm ci
npx wrangler login
npx wrangler whoami
```

Complete the browser login and choose your intended Cloudflare account. After
this login, Codex can use authenticated Wrangler to provision the resources and
deploy the Worker. Do not paste Cloudflare passwords or API tokens into chat.

The resource names already expected by the code are:

| Environment | Worker | D1 database | Private R2 bucket |
| --- | --- | --- | --- |
| Staging | `nemesis-registry-staging` | `nemesis-staging` | `nemesis-packages-staging` |
| Production | `nemesis-registry` | `nemesis-production` | `nemesis-packages-production` |

If you prefer to create them yourself, run `npx wrangler d1 create NAME` for
each database and `npx wrangler r2 bucket create NAME` for each bucket. Put the
returned D1 IDs in `registry/wrangler.jsonc`. Keep R2 public access disabled.
Codex can fill those non-secret IDs once resources exist. Your verified GitHub
user ID, `18219788`, is already configured as the registry administrator.

## 2. Create the registry GitHub App

Open [your GitHub Apps settings](https://github.com/settings/apps) and choose
**New GitHub App**. Start with staging; use a separate App for production so
tests and production credentials remain separate.

| Setting | Value |
| --- | --- |
| App name | A unique name such as NEMESIS Registry Staging |
| Homepage URL | `https://hmason55.github.io/nemesis-package-manager/` |
| User authorization callback URL | `https://nemesis-registry-staging.hmason55.workers.dev/auth/callback` |
| Request user authorization during installation | Disabled; sign-in starts from the website to establish OAuth state and PKCE |
| Setup URL | `https://hmason55.github.io/nemesis-package-manager/#publish` |
| Webhook URL | `https://nemesis-registry-staging.hmason55.workers.dev/webhooks/github` |
| Repository permissions | Metadata: Read-only; Contents: Read-only |
| Events | Release and Repository; GitHub supplies installation lifecycle events |
| Who can install | Any account, so community publishers can install it |

The staging webhook secret is already generated and configured in Cloudflare.
Run `.\registry\scripts\copy-staging-secret.ps1` from the repository root to
copy that same value to your clipboard, then paste it into the App's webhook
Secret field. Do not generate a different value in GitHub.

Generate an OAuth client secret and private key. Record the App ID, client ID, and
App slug (the name in its `github.com/apps/...` URL). App permissions are
read-only on publisher repositories; a separate token dispatches the trusted
validation workflow in your registry repository.

Use the included key converter to avoid installing OpenSSL. From the repository
root, replace the example file path and pipe the converted key directly into
the matching Worker secret:

```powershell
node .\registry\scripts\convert-private-key.mjs 'C:\path\to\your-app.private-key.pem' | npx wrangler secret put GITHUB_PRIVATE_KEY --env staging --config registry/wrangler.jsonc
```

The converter writes no key file. Do not run it without the pipe if you do not
want the key printed in your terminal. Set the remaining
secrets through the Worker settings or `wrangler secret put NAME --env staging`
from the `registry` directory:

| Worker secret | Where it comes from |
| --- | --- |
| `GITHUB_CLIENT_SECRET` | GitHub App OAuth client secret |
| `GITHUB_PRIVATE_KEY` | GitHub App private key converted to PEM PKCS#8 |
| `GITHUB_WEBHOOK_SECRET` | Random value you also enter in the App webhook settings |
| `SESSION_ENCRYPTION_KEY` | 32 random bytes encoded as 64 hex characters |
| `VALIDATOR_TOKEN` | Random secret shared only with the matching validation environment |
| `GITHUB_DISPATCH_TOKEN` | Fine-grained token described below |

Keep actual secrets in provider secret fields or Wrangler's secure prompt. The
App ID, slug, client ID, D1 IDs, and Worker URLs are non-secret and can be shared
with Codex to finish configuration.

Create a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new)
restricted to **only this registry repository**, with **Actions: Read and write**.
Use it as `GITHUB_DISPATCH_TOKEN`. Set an expiration and plan to rotate it.

## 3. Configure GitHub validation environments

Open [repository environments](https://github.com/hmason55/nemesis-package-manager/settings/environments).
Create `registry-staging` and `registry-production`, restricting deployment
branches to `main`.

For each environment add:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `REGISTRY_API_URL` | That environment's actual Worker HTTPS URL |
| Secret | `REGISTRY_VALIDATOR_TOKEN` | The same value as that Worker's `VALIDATOR_TOKEN` |

Keep validation automatic rather than requiring manual environment approval for
every run. Authorized GitHub publishers publish automatically after trusted artifact
validation and ownership checks; there is no mandatory maintainer review step.
Administrator report/retry/rejection/withdrawal controls remain available for abuse.

## 4. Enable GitHub Pages

1. Open [Pages settings](https://github.com/hmason55/nemesis-package-manager/settings/pages).
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open [Actions variables](https://github.com/hmason55/nemesis-package-manager/settings/variables/actions)
   and add repository variable `REGISTRY_API_URL` with the Worker's HTTPS URL.
   Use staging for the first test deployment; after staging passes, change it to
   the production URL and run the website workflow again. This URL is public,
   not a secret.
4. Once the implementation is on `main`, open **Actions → Deploy registry
   website → Run workflow**, selecting `main`.

The expected website address is
[hmason55.github.io/nemesis-package-manager](https://hmason55.github.io/nemesis-package-manager/).
The existing workflow builds the Vite site, validates the configured API address,
and deploys the resulting static files. Do not select “Deploy from a branch” or
point Pages at the source-code `website/` directory.

## 5. Finish deployment and test staging

Codex can finish resource bindings, non-secret config values, D1 migrations, and
Worker deployment after Cloudflare login. The exact commands are in
CLOUD-REGISTRY.md. Deploy staging first, install the staging GitHub App on a
test package repository, and exercise one real release through validation,
automatic publication, browsing, and download.

Large validated installer uploads use 8 MiB multipart requests; enabling a
higher request-body tier is not required solely for the 512 MiB package limit.
Keep GitHub and Cloudflare secrets separate between staging and production.
Actual head-unit HTTPS/cache/NEMESIS installation and the Linux companion build
still require the rollout checks in CLOUD-REGISTRY.md.

## Design reference

The registry follows NuGet's search, package-list, version-selection, metadata
sidebar, and verify-before-submit patterns, adapted to NEMESIS. It keeps its own
brand, does not invent download counts or publisher-verification badges, and
retains public downloads without sign-in. It includes keyboard-operable tabs,
associated form labels, visible focus, skip navigation, responsive layout, and
light/dark themes.

References: [NuGet package search](https://www.nuget.org/packages),
[NuGet package details](https://www.nuget.org/packages/Newtonsoft.Json),
[NuGet publishing](https://learn.microsoft.com/en-us/nuget/nuget-org/publish-a-package),
[Cloudflare R2 setup](https://developers.cloudflare.com/r2/get-started/),
[GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
