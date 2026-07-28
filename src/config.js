const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const CONFIG_FILE = "a11yci.yml";

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

  const rules = config && config.ignore;
  if (rules == null) return [];
  if (!Array.isArray(rules)) {
    warn(`${CONFIG_FILE}: \`ignore\` must be a list. Ignore rules skipped.`);
    return [];
  }
  return rules;
}

module.exports = { loadIgnoreRules, CONFIG_FILE };
