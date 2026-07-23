# a11yci/scan

> Catch accessibility regressions before they ship — WCAG scanning on every pull request.

Powered by [Playwright](https://playwright.dev) and [axe-core](https://github.com/dequelabs/axe-core). Results appear as a PR comment and a GitHub check. New violations block the merge; pre-existing ones don't.

---

## Quick start

Create `.github/workflows/a11y.yml` in your repo:

```yaml
name: Accessibility

on:
  pull_request:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: a11yci/scan@v1
        with:
          url: "https://staging.myapp.com"  # or ${{ vars.STAGING_URL }}
          api-key: ${{ secrets.A11YCI_KEY }}
```

Add `A11YCI_KEY` to your repo secrets (Settings → Secrets and variables → Actions → New repository secret) and push the file. Every pull request will trigger a scan automatically.

---

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `url` | ✅ | — | URL to scan (staging or preview environment) |
| `api-key` | ✅ | — | a11yci API key — store as a GitHub secret |
| `fail-on` | | `serious` | Minimum severity that blocks the PR: `critical`, `serious`, `moderate`, `minor`, or `none` |
| `repo` | | `github.repository` | Repository in `owner/repo` format — auto-detected from context |
| `headers` | | `{}` | Extra HTTP headers as JSON — for Vercel protection bypass, Cloudflare Access, etc. |
| `api-url` | | *(a11yci production)* | Override API base URL (local testing only) |

## Outputs

| Output | Description |
|---|---|
| `scan-id` | The scan ID created by a11yci |
| `new-critical` | Count of new critical violations |
| `new-serious` | Count of new serious violations |
| `new-moderate` | Count of new moderate violations |
| `new-minor` | Count of new minor violations |
| `blocked` | `true` if the PR is blocked, `false` otherwise |

---

## Setup

### 1. Sign up at [a11yci.com](https://a11yci.com)

Create an account and add your repository from the dashboard.

### 2. Create an API key

In the dashboard → **API Keys** → **New key**. The raw key is shown once — copy it immediately.

### 3. Add the secret to your repo

GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

- Name: `A11YCI_KEY`
- Value: *(paste the key)*

### 4. Install the a11yci GitHub App

The dashboard will prompt you to install the GitHub App on your repo. This is required for PR comments — the check status works without it, but no comment will appear.

### 5. Add the workflow file

Paste `.github/workflows/a11y.yml` from the Quick start above and push to your repo. The next pull request will trigger a scan automatically.

---

## Failure thresholds

The `fail-on` input controls which severity levels block the PR. Only **new** violations (not pre-existing ones) trigger a failure.

| `fail-on` value | Blocks on |
|---|---|
| `critical` | Critical only |
| `serious` *(default)* | Critical + serious |
| `moderate` | Critical + serious + moderate |
| `minor` | Any new violation |
| `none` | Never blocks (report only) |

---

## Bypass headers

For staging environments protected by Vercel authentication or Cloudflare Access:

```yaml
- uses: a11yci/scan@v1
  with:
    url: ${{ vars.STAGING_URL }}
    api-key: ${{ secrets.A11YCI_KEY }}
    headers: |
      {
        "x-vercel-protection-bypass": "${{ secrets.VERCEL_BYPASS_TOKEN }}",
        "x-vercel-set-bypass-cookie": "true"
      }
```

For Cloudflare Access:

```yaml
headers: |
  {
    "CF-Access-Client-Id": "${{ secrets.CF_CLIENT_ID }}",
    "CF-Access-Client-Secret": "${{ secrets.CF_CLIENT_SECRET }}"
  }
```

---

## PR comment

The a11yci GitHub App posts a comment on every PR with a breakdown of new and total violations by severity, links to each failing element, and a link to the full report in the dashboard.

---

## License

MIT © [a11yci](https://a11yci.com)
