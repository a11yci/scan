const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

async function scanUrl(url, extraHeaders = {}) {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext({
      extraHTTPHeaders: extraHeaders,
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

    const start = Date.now();
    const results = await new AxeBuilder({ page }).analyze();
    const scan_duration_ms = Date.now() - start;

    return {
      url,
      scan_duration_ms,
      violations: results.violations,
      violation_count: results.violations.length,
    };
  } finally {
    await browser.close();
  }
}

module.exports = { scanUrl };
