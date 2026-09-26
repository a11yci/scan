const core = require("@actions/core");
const github = require("@actions/github");
const { createScan, ingestResults, ApiUnavailableError, QuotaExceededError } = require("./api");
const { scanUrl } = require("./scanner");
const { loadIgnoreRules, CONFIG_FILE } = require("./config");

const SEVERITIES = ["critical", "serious", "moderate", "minor"];

function parseSeverity(input) {
  const val = (input || "none").toLowerCase();
  if (val === "none") return null;
  if (!SEVERITIES.includes(val)) {
    throw new Error(`Invalid fail-on value: "${val}". Must be one of: ${SEVERITIES.join(", ")}, none`);
  }
  return val;
}

function isBlocked(summary, failOn) {
  if (!failOn) return false;
  const idx = SEVERITIES.indexOf(failOn);
  return SEVERITIES.slice(0, idx + 1).some((s) => (summary.new[s] || 0) > 0);
}

function buildStepSummary(summary, blocked, failOn, exceptions = []) {
  const rows = SEVERITIES.map(
    (s) => `| ${s.charAt(0).toUpperCase() + s.slice(1)} | ${summary.new[s] || 0} | ${summary.total[s] || 0} |`
  ).join("\n");

  const status = blocked ? "❌ PR blocked" : "✅ PR passed";
  const exceptionLine = exceptions.length
    ? `\n\n📋 ${exceptions.length} documented exception${exceptions.length === 1 ? "" : "s"} (not blocking)`
    : "";

  return `## a11yci Accessibility Scan ${status}

| Severity | New | Total |
|----------|-----|-------|
${rows}${exceptionLine}

${blocked ? `> **Blocked:** new violations at or above **${failOn}** severity found. Fix them or lower the \`fail-on\` threshold.` : ""}
`.trim();
}

async function run() {
  try {
    const url      = core.getInput("url", { required: true });
    const apiKey   = core.getInput("api-key", { required: true });
    const repo     = core.getInput("repo") || github.context.payload.repository?.full_name;
    const failOn   = parseSeverity(core.getInput("fail-on"));
    const apiUrl   = core.getInput("api-url").replace(/\/$/, "");
    const headersRaw = core.getInput("headers") || "{}";

    let extraHeaders = {};
    try {
      extraHeaders = JSON.parse(headersRaw);
    } catch {
      throw new Error(`Invalid JSON in "headers" input: ${headersRaw}`);
    }

    const ctx = github.context;
    const prNumber  = ctx.payload.pull_request?.number ?? null;
    const branch    = ctx.payload.pull_request?.head?.ref ?? ctx.ref?.replace("refs/heads/", "") ?? null;
    const commitSha = ctx.payload.pull_request?.head?.sha ?? ctx.sha ?? null;

    core.info(`Creating scan for ${repo} — ${url}`);
    const scan = await createScan(apiUrl, apiKey, {
      repo, prNumber, branch, commitSha, failOn: failOn ?? "none",
    });
    core.info(`Scan created: ${scan.id}`);
    core.setOutput("scan-id", scan.id);

    // Ignore rules go to the API verbatim; violations are never filtered
    // client-side. The scanner only annotates selector matches in-DOM.
    const ignoreRules = loadIgnoreRules(core.warning);
    if (ignoreRules.length) {
      core.info(`Loaded ${ignoreRules.length} ignore rule(s) from ${CONFIG_FILE}`);
    }

    core.info(`Scanning ${url} with axe-core…`);
    const { axe_meta: axeMeta, ...page } = await scanUrl(url, extraHeaders, ignoreRules);
    core.info(`Found ${page.violation_count} violations on ${url}`);

    // Evidence method block: axe's testEngine/testEnvironment/toolOptions plus
    // where the scan ran. The server records it in the scan's frozen method
    // manifest (specs/2026-09-25-as-of-record R5) — without it the record
    // cannot say which axe version checked the page.
    const method = { ...axeMeta, scan_engine: "github_action" };

    core.info("Ingesting results…");
    const result = await ingestResults(apiUrl, apiKey, scan.id, [page], ignoreRules, method);

    const { summary } = result;
    const exceptions = result.exceptions || [];
    for (const invalid of result.invalid_exception_rules || []) {
      const label = invalid.rule || `entry #${(invalid.index ?? 0) + 1}`;
      core.warning(
        `Invalid exception in ${CONFIG_FILE} — ${label}: ${(invalid.errors || []).join("; ")}. ` +
        "This exception was ignored; the violation it targets stays active."
      );
    }
    if (exceptions.length) {
      core.info(`📋 ${exceptions.length} documented exception(s) applied (not blocking)`);
    }
    core.setOutput("new-critical",  String(summary.new.critical  || 0));
    core.setOutput("new-serious",   String(summary.new.serious   || 0));
    core.setOutput("new-moderate",  String(summary.new.moderate  || 0));
    core.setOutput("new-minor",     String(summary.new.minor     || 0));

    const blocked = isBlocked(summary, failOn);
    core.setOutput("blocked", String(blocked));
    core.setOutput("quota-exceeded", "false");

    // App-install visibility (mirrors the quota pattern): the server tells us
    // when the GitHub App is missing — without it the PR comment silently never
    // posts. Warn everywhere the user might look; never change the conclusion.
    // Absent field (older API) = assume installed, stay silent.
    const appInstalled = result.app_installed !== false;
    core.setOutput("app-installed", String(appInstalled));
    const installUrl =
      result.app_install_url || "https://github.com/apps/a11yci-app/installations/new";
    if (!appInstalled) {
      core.warning(
        `a11yci: the a11yci GitHub App is not installed on ${repo}. Scan results were ` +
        `recorded, but PR comments cannot post until it is installed: ${installUrl}`
      );
    }

    let summaryMd = buildStepSummary(summary, blocked, failOn, exceptions);
    if (!appInstalled) {
      summaryMd +=
        `\n\n⚠️ The a11yci GitHub App is not installed on this repository — ` +
        `PR comments cannot post. [Install the App](${installUrl})`;
    }
    await core.summary.addRaw(summaryMd).write();

    if (blocked) {
      core.setFailed(
        `a11yci: new ${failOn}+ violations found. ` +
        `new critical=${summary.new.critical || 0} serious=${summary.new.serious || 0} ` +
        `moderate=${summary.new.moderate || 0} minor=${summary.new.minor || 0}`
      );
    } else {
      core.info("a11yci: no new violations above threshold. Check passed.");
    }
  } catch (err) {
    // Quota exhausted is NOT downtime: stay green (a billing state must never
    // block a merge) but say so honestly everywhere the user might look. The
    // server posts the matching PR comment (G5, spec quota-visibility).
    if (err instanceof QuotaExceededError) {
      core.setOutput("quota-exceeded", "true");
      core.setOutput("blocked", "false");
      core.warning(
        "a11yci: monthly scan limit reached — this pull request was not scanned. " +
        "The limit resets on the 1st of the month."
      );
      await core.summary
        .addRaw(
          "⚠️ a11yci scan skipped — monthly scan limit reached. " +
          "Scans resume on the 1st of the month. Build not affected."
        )
        .write();
      return;
    }
    // Fail OPEN on a11yci API problems (PRD §23 Directive 1): our downtime
    // must never block a customer's merge. Scanner/config errors still fail.
    if (err instanceof ApiUnavailableError) {
      core.warning("a11yci API unavailable — scan skipped");
      core.warning(`Error: ${err.message}`);
      await core.summary
        .addRaw("⚠️ a11yci scan skipped — API unreachable. Build not affected.")
        .write();
      return;
    }
    core.setFailed(err.message);
  }
}

run();
