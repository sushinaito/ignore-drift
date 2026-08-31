import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { VERSION } from "../src/version.js";

const root = new URL("../", import.meta.url);

function read(relative) {
  return fs.readFileSync(new URL(relative, root), "utf8");
}

test("release-facing version references stay synchronized", () => {
  const manifest = JSON.parse(read("package.json"));
  const configSchema = JSON.parse(read("schema/ignore-drift.schema.json"));
  const reportSchema = JSON.parse(read("schema/report-v2.schema.json"));

  assert.equal(VERSION, manifest.version);
  assert.match(read("CHANGELOG.md"), new RegExp(`## \\[${VERSION}\\]`));
  assert.match(read("README.md"), new RegExp(`#v${VERSION.replaceAll(".", "\\.")}`));
  assert.match(configSchema.$id, new RegExp(`/v${VERSION.replaceAll(".", "\\.")}/`));
  assert.match(reportSchema.$id, new RegExp(`/v${VERSION.replaceAll(".", "\\.")}/`));
});

test("the packaged CLI entry point remains executable", () => {
  const mode = fs.statSync(new URL("bin/ignore-drift.js", root)).mode;
  assert.notEqual(mode & 0o111, 0);
  assert.match(read("bin/ignore-drift.js"), /^#!\/usr\/bin\/env node/);
});
