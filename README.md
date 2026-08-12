# a11yci/scan

> Catch accessibility regressions before they ship — WCAG scanning on every pull request.

Powered by [Playwright](https://playwright.dev) and [axe-core](https://github.com/dequelabs/axe-core). Results appear as a PR comment and a GitHub check. New violations block the merge; pre-existing ones don't.

---

## Quick start

Create `.github/workflows/a11y.yml` in your repo:

```yaml
name: Accessibility

on:
  push:
    branches: [main]   # scans on main set the baseline PRs are diffed against
  pull_request:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4   # lets the action read a11yci.yml if you add one
      - uses: a11yci/scan@v1
        with:
          url: "https://staging.myapp.com"  # or ${{ vars.STAGING_URL }}
          api-key: ${{ secrets.A11YCI_KEY }}
```

Add `A11YCI_KEY` to your repo secrets (Settings → Secrets and variables → Actions → New repository secret) and push the file. The first push to `main` runs a scan that becomes your baseline; every pull request after that is diffed against it, so PRs only flag the violations they introduce. Keep the `push` trigger — without a scan on your default branch there is no baseline, and every PR would report all violations as new. If your default branch isn't `main`, use that branch name instead.

---

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `url` | ✅ | — | URL to scan (staging or preview environment) |
| `api-key` | ✅ | — | a11yci API key — store as a GitHub secret |
| `fail-on` | | `none` | Minimum severity that blocks the PR: `critical`, `serious`, `moderate`, `minor`, or `none` (report-only, the default) |
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
| `serious` | Critical + serious |
| `moderate` | Critical + serious + moderate |
| `minor` | Any new violation |
| `none` *(default)* | Never blocks (report only) |

New accounts start in report-only mode: you see every violation in the PR comment and dashboard, but nothing blocks. Once your team trusts the signal, set `fail-on: serious` to start blocking merges on new violations.

## Documented exceptions

Some violations are real but out of your hands — a YouTube embed's missing captions, a third-party ad widget. Instead of disabling the check, document them in an `a11yci.yml` at the root of your repository.

> **Your workflow must check out the repo** (`- uses: actions/checkout@v4` before the scan step, as in the quick start) — that's how the action finds `a11yci.yml`. Without it, ignore rules are silently skipped.

```yaml
version: 1                       # schema version (optional, defaults to 1)

ignore:
  - rule: video-caption          # axe rule id (required)
    selector: ".youtube-embed *" # CSS selector for the affected elements (required)
    reason: "Third-party YouTube embed — captions provided by YouTube"  # required, non-empty
    added_date: 2026-07-28       # optional
    ticket: A11Y-42              # optional
```

`version:` identifies the config schema version so future format changes are a version bump, not a breaking change. Unrecognized top-level keys never fail the scan — they're ignored with a warning in the action log (so a typo doesn't fail silently).

Matching violations still appear in your data and PR comment — listed under **📋 Documented exceptions (not blocking)** — but they no longer count as new violations or block merges. This is documentation, not suppression: each exception carries a written reason and its full history (added, active since, removed) in the a11yci dashboard, ready for compliance reporting.

A rule missing a non-empty `reason` (or `rule`/`selector`) is skipped with a warning in the action log and the PR comment — the violations it targets stay active. Exceptions never fail the scan.

Limitations (v1): selectors are evaluated on the live page at scan time and don't reach into shadow DOM or iframes; an exception applies only when both the rule id and the selector match.

### What happens if a11yci is down?

**a11yci never blocks your merge due to our downtime.** If the a11yci API is unreachable for any reason — network error, timeout, or server error — the action logs a warning, skips the scan, and exits successfully. Your pipeline only fails when new violations at or above your `fail-on` threshold are actually found.

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

Each violation also includes a **"How to fix"** prompt — a code block describing the violation, the failing element, and the fix. Paste it into your AI coding agent (Claude Code, Cursor, Windsurf, …) or follow it by hand. The same prompt is available via the **Copy fix prompt** button on each violation in the dashboard.

```
Fix image-alt violation. Element: <img src="/hero.jpg">.
Image filename: /hero.jpg. Generate a descriptive alt attribute
based on the image filename and the surrounding component context.
```

---

## License

MIT © [a11yci](https://a11yci.com)
