const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { loadIgnoreRules, CONFIG_FILE } = require("../src/config");

// Each case gets its own workspace dir so GITHUB_WORKSPACE points at a
// fresh a11yci.yml.
function withConfig(yamlText, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a11yci-config-test-"));
  fs.writeFileSync(path.join(dir, CONFIG_FILE), yamlText);
  const prev = process.env.GITHUB_WORKSPACE;
  process.env.GITHUB_WORKSPACE = dir;
  try {
    return fn();
  } finally {
    process.env.GITHUB_WORKSPACE = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("unknown top-level key warns but the scan still gets its rules", () => {
  const warnings = [];
  const rules = withConfig(
    [
      "version: 1",
      "ignroe_typo: true",
      "ignore:",
      "  - rule: button-name",
      '    selector: ".widget *"',
      '    reason: "Third-party widget"',
    ].join("\n"),
    () => loadIgnoreRules((msg) => warnings.push(msg))
  );

  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0], /unknown key `ignroe_typo` ignored/);
  assert.strictEqual(rules.length, 1);
  assert.strictEqual(rules[0].rule, "button-name");
});

test("reserved keys (states, exercise) are accepted without warning", () => {
  const warnings = [];
  const rules = withConfig(
    [
      "version: 1",
      "pages:",
      "  - url: /",
      "states: []",
      "exercise:",
      "  enabled: false",
      "ignore:",
      "  - rule: image-alt",
      '    selector: ".hero img"',
      '    reason: "CMS-sourced image"',
    ].join("\n"),
    () => loadIgnoreRules((msg) => warnings.push(msg))
  );

  assert.deepStrictEqual(warnings, []);
  assert.strictEqual(rules.length, 1);
});

test("unknown key with no ignore section warns and returns no rules", () => {
  const warnings = [];
  const rules = withConfig("exersize: true\n", () =>
    loadIgnoreRules((msg) => warnings.push(msg))
  );

  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0], /unknown key `exersize` ignored/);
  assert.deepStrictEqual(rules, []);
});
