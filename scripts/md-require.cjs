// Lets tsx scripts import the prompt .md files the way Next's bundler does (as plain strings).
// Usage: npx tsx --require ./scripts/md-require.cjs scripts/<name>.ts
const { readFileSync } = require("node:fs");
require.extensions[".md"] = (module, filename) => {
  module.exports = readFileSync(filename, "utf8");
};
