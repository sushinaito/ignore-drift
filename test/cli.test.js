import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.js";
import { createRepository, sink, trackAll, write } from "./helpers.js";

function repositoryWithDockerLeak() {
  const root = createRepository();
  write(root, ".gitignore", ".env\n");
  write(root, ".dockerignore", ".git\n");
  write(root, "Dockerfile", "FROM scratch\n");
  write(root, ".env", "TOKEN=secret\n");
  trackAll(root);
  return root;
}

function invoke(args, cwd) {
  const stdout = sink();
  const stderr = sink();
  const exitCode = runCli(args, {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd,
  });
  return { exitCode, stdout: stdout.read(), stderr: stderr.read() };
}

test("JSON output has a stable schema and errors fail by default", () => {
  const root = repositoryWithDockerLeak();
  const output = invoke(["check", root, "--json"], root);
  const result = JSON.parse(output.stdout);

  assert.equal(output.exitCode, 1);
  assert.equal(output.stderr, "");
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.findings[0].code, "ID001");
});

test("--fail-on never keeps findings informational", () => {
  const root = repositoryWithDockerLeak();
  const output = invoke([root, "--fail-on", "never"], root);

  assert.equal(output.exitCode, 0);
  assert.match(output.stdout, /ERROR ID001 \.env \[docker\]/);
});

test("SARIF output contains valid tool and result records", () => {
  const root = repositoryWithDockerLeak();
  const output = invoke([root, "--format", "sarif", "--fail-on", "never"], root);
  const sarif = JSON.parse(output.stdout);

  assert.equal(output.exitCode, 0);
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].tool.driver.name, "ignore-drift");
  assert.equal(sarif.runs[0].results[0].ruleId, "ID001");
});

test("GitHub format emits native workflow annotations", () => {
  const root = repositoryWithDockerLeak();
  const output = invoke([root, "--format", "github", "--fail-on", "never"], root);

  assert.match(output.stdout, /^::error file=\.env,title=ID001 docker exposure::/);
});

test("init creates policy once and refuses to overwrite it", () => {
  const root = createRepository();
  write(root, "README.md");
  trackAll(root);

  const first = invoke(["init", root], root);
  const second = invoke(["init", root], root);
  const config = JSON.parse(fs.readFileSync(path.join(root, ".ignore-drift.json"), "utf8"));

  assert.equal(first.exitCode, 0);
  assert.equal(config.surfaces.docker, "auto");
  assert.equal(second.exitCode, 2);
  assert.match(second.stderr, /already exists/);
});

test("unknown surfaces and options return usage errors", () => {
  const root = createRepository();
  write(root, "README.md");
  trackAll(root);

  assert.equal(invoke([root, "--surface", "zip"], root).exitCode, 2);
  assert.equal(invoke(["--wat"], root).exitCode, 2);
});
