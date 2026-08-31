import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { explainPath, scanRepository } from "../src/scanner.js";

function createRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ignore-drift-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: root,
  });
  execFileSync("git", ["config", "user.name", "Ignore Drift Tests"], {
    cwd: root,
  });
  return root;
}

function write(root, filename, content = "fixture\n") {
  const target = path.join(root, filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function trackAll(root) {
  execFileSync("git", ["add", "."], { cwd: root });
}

test("reports a sensitive Git-ignored path sent to Docker", () => {
  const root = createRepository();
  write(root, ".gitignore", ".env\ndist/\n");
  write(root, ".dockerignore", ".git\ndist\n");
  write(root, ".env", "TOKEN=secret\n");
  write(root, "dist/app.js");
  trackAll(root);

  const result = scanRepository(root);
  const finding = result.findings.find((item) => item.path === ".env");

  assert.equal(finding?.code, "ID001");
  assert.equal(finding?.severity, "error");
  assert.equal(
    result.findings.some((item) => item.path === "dist/"),
    false,
  );
});

test("groups tracked files excluded by the same Docker directory", () => {
  const root = createRepository();
  write(root, ".gitignore", "node_modules/\n");
  write(root, ".dockerignore", ".git\nsrc\nnode_modules\n");
  write(root, "src/one.js");
  write(root, "src/two.js");
  trackAll(root);

  const result = scanRepository(root);
  const sourceFindings = result.findings.filter(
    (item) => item.code === "ID002" && item.path === "src/",
  );

  assert.equal(sourceFindings.length, 1);
  assert.match(sourceFindings[0].samplePath, /^src\//);
});

test("returns no findings when Git and Docker ignores are aligned", () => {
  const root = createRepository();
  write(root, ".gitignore", ".env\ndist/\nnode_modules/\n");
  write(root, ".dockerignore", ".git\n.env\ndist\nnode_modules\n");
  write(root, ".env");
  write(root, "dist/app.js");
  write(root, "src/index.js");
  trackAll(root);

  const result = scanRepository(root);

  assert.deepEqual(result.findings, []);
});

test("explain reports Git and Docker rule provenance", () => {
  const root = createRepository();
  write(root, ".gitignore", "*.pem\n");
  write(root, ".dockerignore", ".git\n");
  write(root, "private.pem");
  trackAll(root);

  const result = explainPath("private.pem", {
    startDirectory: root,
    baseDirectory: root,
  });

  assert.equal(result.git.ignored, true);
  assert.equal(result.git.source.file, ".gitignore");
  assert.equal(result.git.source.line, 1);
  assert.equal(result.docker.status, "included");
  assert.equal(result.finding.code, "ID001");
});

test("a missing .dockerignore exposes Git metadata", () => {
  const root = createRepository();
  write(root, "README.md");
  trackAll(root);

  const result = scanRepository(root);
  const finding = result.findings.find((item) => item.path === ".git/");

  assert.equal(result.dockerignore.exists, false);
  assert.equal(finding?.code, "ID001");
  assert.equal(finding?.severity, "error");
});
