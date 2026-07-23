const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

async function scanUrl(url, extraHeaders = {}) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      extraHTTPHeaders: extraHeaders,
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

    const results = await new AxeBuilder({ page }).analyze();

    const violations = results.violations.map((v) => ({
      rule_id: v.id,
      impact: v.impact,
      description: v.description,
      help_url: v.helpUrl,
      nodes: v.nodes.map((n) => ({
        html: n.html,
        target: n.target,
        failure_summary: n.failureSummary,
      })),
    }));

    return {
      url,
      violations,
      violation_count: violations.length,
    };
  } finally {
    await browser.close();
  }
}

module.exports = { scanUrl };
