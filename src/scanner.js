const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

async function scanUrl(url, extraHeaders = {}, ignoreRules = []) {
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

    await annotateIgnoreMatches(page, results.violations, ignoreRules);

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

// Marks each violation node with the indexes of ignore rules whose selector
// matches its element, evaluated in the live DOM (spec EX-Y3). The annotation
// is advisory: nothing is filtered here, the server decides what counts.
// v1 limitation: elements inside shadow DOM or iframes (axe targets with more
// than one entry) are never annotated — exceptions don't reach across those
// boundaries.
async function annotateIgnoreMatches(page, violations, ignoreRules) {
  const selectors = ignoreRules.map((rule) =>
    rule && typeof rule.selector === "string" ? rule.selector : null
  );
  if (!selectors.some(Boolean)) return;

  const nodeRefs = [];
  violations.forEach((violation, vi) => {
    (violation.nodes || []).forEach((node, ni) => {
      const target = node.target || [];
      if (target.length === 1 && typeof target[0] === "string") {
        nodeRefs.push({ vi, ni, css: target[0] });
      }
    });
  });
  if (!nodeRefs.length) return;

  const matches = await page.evaluate(
    ({ nodeRefs, selectors }) =>
      nodeRefs.map(({ vi, ni, css }) => {
        let el = null;
        try {
          el = document.querySelector(css);
        } catch {
          el = null;
        }
        if (!el) return { vi, ni, ruleIndexes: [] };

        const ruleIndexes = [];
        selectors.forEach((selector, index) => {
          if (!selector) return;
          try {
            if (el.matches(selector)) ruleIndexes.push(index);
          } catch {
            // invalid selector — never matches
          }
        });
        return { vi, ni, ruleIndexes };
      }),
    { nodeRefs, selectors }
  );

  matches.forEach(({ vi, ni, ruleIndexes }) => {
    if (ruleIndexes.length) {
      violations[vi].nodes[ni].a11yci_ignore_matches = ruleIndexes;
    }
  });
}

module.exports = { scanUrl };
