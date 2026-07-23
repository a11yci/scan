const core = require("@actions/core");
const github = require("@actions/github");
const { createScan, ingestResults } = require("./api");
const { scanUrl } = require("./scanner");

const SEVERITIES = ["critical", "serious", "moderate", "minor"];

function parseSeverity(input) {
  const val = (input || "serious").toLowerCase();
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

function buildStepSummary(summary, blocked, failOn) {
  const rows = SEVERITIES.map(
    (s) => `| ${s.charAt(0).toUpperCase() + s.slice(1)} | ${summary.new[s] || 0} | ${summary.total[s] || 0} |`
  ).join("\n");

  const status = blocked ? "❌ PR blocked" : "✅ PR passed";

  return `## a11yci Accessibility Scan ${status}

| Severity | New | Total |
|----------|-----|-------|
${rows}

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
    const scan = await createScan(apiUrl, apiKey, { repo, prNumber, branch, commitSha });
    core.info(`Scan created: ${scan.id}`);
    core.setOutput("scan-id", scan.id);

    core.info(`Scanning ${url} with axe-core…`);
    const page = await scanUrl(url, extraHeaders);
    core.info(`Found ${page.violation_count} violations on ${url}`);

    core.info("Ingesting results…");
    const result = await ingestResults(apiUrl, apiKey, scan.id, [page]);

    const { summary } = result;
    core.setOutput("new-critical",  String(summary.new.critical  || 0));
    core.setOutput("new-serious",   String(summary.new.serious   || 0));
    core.setOutput("new-moderate",  String(summary.new.moderate  || 0));
    core.setOutput("new-minor",     String(summary.new.minor     || 0));

    const blocked = isBlocked(summary, failOn);
    core.setOutput("blocked", String(blocked));

    await core.summary.addRaw(buildStepSummary(summary, blocked, failOn)).write();

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
    core.setFailed(err.message);
  }
}

run();
