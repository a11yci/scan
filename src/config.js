const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const CONFIG_FILE = "a11yci.yml";

// Top-level keys the v1 schema recognizes. `states` and `exercise` are
// reserved for future use (coverage-expansion PRD §6): accepted silently,
// nothing reads them yet. Anything else is likely a typo — warn so it
// doesn't fail silently, but never fail the scan over config problems.
const KNOWN_TOP_LEVEL_KEYS = ["version", "pages", "ignore", "states", "exercise"];

// Loads the `ignore:` rules from a11yci.yml in the customer's checkout.
// Rules are forwarded to the API VERBATIM — the Action never validates or
// filters them; the server is the judge (spec EX-Y2). A missing file means
// no rules; a malformed file warns and proceeds with none (config problems
// must never fail a customer's build).
function loadIgnoreRules(warn = () => {}) {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const configPath = path.join(workspace, CONFIG_FILE);
  if (!fs.existsSync(configPath)) return [];

  let config;
  try {
    config = yaml.load(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    warn(`Could not parse ${CONFIG_FILE}: ${err.message}. Ignore rules skipped.`);
    return [];
  }

  if (config && typeof config === "object" && !Array.isArray(config)) {
    for (const key of Object.keys(config)) {
      if (!KNOWN_TOP_LEVEL_KEYS.includes(key)) {
        warn(
          `${CONFIG_FILE}: unknown key \`${key}\` ignored ` +
            `(known keys: ${KNOWN_TOP_LEVEL_KEYS.join(", ")}).`
        );
      }
    }
  }

  const rules = config && config.ignore;
  if (rules == null) return [];
  if (!Array.isArray(rules)) {
    warn(`${CONFIG_FILE}: \`ignore\` must be a list. Ignore rules skipped.`);
    return [];
  }
  return rules;
}

module.exports = { loadIgnoreRules, CONFIG_FILE };
