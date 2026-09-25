const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http");

const { createScan, ApiUnavailableError, QuotaExceededError } = require("../src/api");

// Spins up a throwaway local server so the real request path (status parsing,
// error classification) is exercised — no mocking of src/api.js internals.
function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", async () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      try {
        await fn(url);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

const SCAN_PARAMS = { repo: "acme/site", prNumber: 42, branch: "b", commitSha: "c", failOn: "none" };

test("422 with code scan_limit_reached throws QuotaExceededError", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Scan limit reached for this month", code: "scan_limit_reached" }));
    },
    async (url) => {
      await assert.rejects(
        createScan(url, "a11y_key", SCAN_PARAMS),
        (err) => err instanceof QuotaExceededError && /Scan limit reached/.test(err.message)
      );
    }
  );
});

test("422 without the quota code stays ApiUnavailableError (fail-open)", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ errors: ["Triggered by is not included in the list"] }));
    },
    async (url) => {
      await assert.rejects(
        createScan(url, "a11y_key", SCAN_PARAMS),
        (err) => err instanceof ApiUnavailableError && !(err instanceof QuotaExceededError)
      );
    }
  );
});

test("non-201 server errors stay ApiUnavailableError", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(500);
      res.end("oops");
    },
    async (url) => {
      await assert.rejects(
        createScan(url, "a11y_key", SCAN_PARAMS),
        (err) => err instanceof ApiUnavailableError
      );
    }
  );
});

test("201 resolves with the scan body", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "scan-1", status: "pending" }));
    },
    async (url) => {
      const scan = await createScan(url, "a11y_key", SCAN_PARAMS);
      assert.strictEqual(scan.id, "scan-1");
    }
  );
});

test("ingest response passes app_installed through to the caller", async () => {
  const { ingestResults } = require("../src/api");
  await withServer(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        scan_id: "scan-1", status: "completed",
        summary: { new: {}, total: {} },
        app_installed: false,
        app_install_url: "https://github.com/apps/a11yci-app/installations/new",
      }));
    },
    async (url) => {
      const result = await ingestResults(url, "a11y_key", "scan-1", [], []);
      assert.strictEqual(result.app_installed, false);
      assert.match(result.app_install_url, /installations\/new/);
    }
  );
});
