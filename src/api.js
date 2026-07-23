const https = require("https");
const http = require("http");
const { URL } = require("url");

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

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function createScan(apiUrl, apiKey, { repo, prNumber, branch, commitSha }) {
  const res = await request("POST", `${apiUrl}/api/v1/scans`, {
    repo,
    triggered_by: "github_action",
    pr_number: prNumber,
    branch,
    commit_sha: commitSha,
  }, apiKey);

  if (res.status !== 201) {
    throw new Error(`Failed to create scan: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function ingestResults(apiUrl, apiKey, scanId, pages) {
  const res = await request("POST", `${apiUrl}/api/v1/scans/ingest`, {
    scan_id: scanId,
    pages,
  }, apiKey);

  if (res.status !== 200) {
    throw new Error(`Failed to ingest results: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

module.exports = { createScan, ingestResults };
