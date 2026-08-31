import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { scanRepository } from "../src/scanner.js";
import { createRepository, trackAll, write, writeJson } from "./helpers.js";

function loadSchema(name) {
  return JSON.parse(
    fs.readFileSync(new URL(`../schema/${name}`, import.meta.url), "utf8"),
  );
}

function validatorFor(name) {
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(loadSchema(name));
}

test("the public report schema accepts generated reports, including allowances", () => {
  const root = createRepository();
  write(root, ".gitignore", "dist/\n");
  writeJson(root, "package.json", {
    name: "schema-fixture",
    version: "1.0.0",
    files: ["dist"],
  });
  write(root, "dist/index.js");
  writeJson(root, ".ignore-drift.json", {
    surfaces: { docker: false, npm: true },
    allow: [{ path: "dist/**", reason: "Published build output." }],
  });
  trackAll(root);

  const report = scanRepository(root);
  const validate = validatorFor("report-v2.schema.json");

  assert.equal(validate(report), true, JSON.stringify(validate.errors));
});

test("the public configuration schema accepts a complete policy", () => {
  const validate = validatorFor("ignore-drift.schema.json");
  const config = {
    $schema:
      "https://raw.githubusercontent.com/sushinaito/ignore-drift/v1.0.0/schema/ignore-drift.schema.json",
    surfaces: { docker: "auto", npm: true },
    sensitivePatterns: ["**/*.vault"],
    allow: [
      {
        code: "ID101",
        surface: "npm",
        path: "dist/**",
        reason: "Compiled package output.",
      },
    ],
  };

  assert.equal(validate(config), true, JSON.stringify(validate.errors));
});
