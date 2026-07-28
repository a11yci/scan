const https = require("https");
const http = require("http");
const { URL } = require("url");

const REQUEST_TIMEOUT_MS = 30_000;

// Any failure to get a successful answer from the a11yci API. The action
// fails OPEN on this — a11yci downtime must never block a customer's merge.
class ApiUnavailableError extends Error {}

function request(method, url, body, apiKey) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new ApiUnavailableError(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
    });
    req.on("error", (err) =>
      reject(err instanceof ApiUnavailableError ? err : new ApiUnavailableError(err.message))
    );
    if (payload) req.write(payload);
    req.end();
  });
}

async function createScan(apiUrl, apiKey, { repo, prNumber, branch, commitSha, failOn }) {
  const res = await request("POST", `${apiUrl}/api/v1/scans`, {
    repo,
    triggered_by: "github_action",
    pr_number: prNumber,
    branch,
    commit_sha: commitSha,
    fail_on: failOn,
  }, apiKey);

  if (res.status !== 201) {
    throw new ApiUnavailableError(`Failed to create scan: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function ingestResults(apiUrl, apiKey, scanId, pages, ignoreRules = []) {
  const res = await request("POST", `${apiUrl}/api/v1/scans/ingest`, {
    scan_id: scanId,
    pages,
    ignore_rules: ignoreRules,
  }, apiKey);

  if (res.status !== 200) {
    throw new ApiUnavailableError(`Failed to ingest results: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

module.exports = { createScan, ingestResults, ApiUnavailableError };
