import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.js";

function sink() {
  let value = "";
  return {
    stream: { write(chunk) { value += chunk; } },
    read() { return value; },
  };
}

function repositoryWithLeak() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ignore-drift-cli-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
  fs.writeFileSync(path.join(root, ".gitignore"), ".env\n");
  fs.writeFileSync(path.join(root, ".dockerignore"), ".git\n");
  fs.writeFileSync(path.join(root, ".env"), "TOKEN=secret\n");
  execFileSync("git", ["add", ".gitignore", ".dockerignore"], { cwd: root });
  return root;
}

test("JSON output is machine-readable and errors fail by default", () => {
  const root = repositoryWithLeak();
  const stdout = sink();
  const stderr = sink();

  const exitCode = runCli(["check", root, "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: root,
  });
  const result = JSON.parse(stdout.read());

  assert.equal(exitCode, 1);
  assert.equal(stderr.read(), "");
  assert.equal(result.findings[0].code, "ID001");
});

test("--fail-on never keeps findings informational", () => {
  const root = repositoryWithLeak();
  const stdout = sink();
  const stderr = sink();

  const exitCode = runCli([root, "--fail-on", "never"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: root,
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.read(), /ERROR ID001 \.env/);
  assert.equal(stderr.read(), "");
});

test("unknown options return a usage error", () => {
  const stdout = sink();
  const stderr = sink();

  const exitCode = runCli(["--wat"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 2);
  assert.match(stderr.read(), /Unknown option/);
});
