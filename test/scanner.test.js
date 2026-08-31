import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { explainPath, scanRepository } from "../src/scanner.js";
import { createRepository, trackAll, write, writeJson } from "./helpers.js";

function packageManifest(overrides = {}) {
  return {
    name: "fixture-package",
    version: "1.0.0",
    ...overrides,
  };
}

test("reports a sensitive Git-ignored path exposed to Docker", () => {
  const root = createRepository();
  write(root, ".gitignore", ".env\ndist/\n");
  write(root, ".dockerignore", ".git\ndist\n");
  write(root, "Dockerfile", "FROM scratch\n");
  write(root, ".env", "TOKEN=secret\n");
  write(root, "dist/app.js");
  trackAll(root);

  const result = scanRepository(root);
  const finding = result.findings.find((item) => item.path === ".env");

  assert.equal(finding?.code, "ID001");
  assert.equal(finding?.surface, "docker");
  assert.equal(finding?.severity, "error");
  assert.equal(result.surfaces.docker.active, true);
  assert.equal(result.findings.some((item) => item.path === "dist/"), false);
});

test("reports Git-ignored build output exposed to an npm package", () => {
  const root = createRepository();
  write(root, ".gitignore", "dist/\n");
  writeJson(root, "package.json", packageManifest({ files: ["dist"] }));
  write(root, "dist/index.js", "export const answer = 42;\n");
  trackAll(root);

  const result = scanRepository(root);
  const finding = result.findings.find((item) => item.code === "ID101");

  assert.equal(finding?.path, "dist/");
  assert.equal(finding?.surface, "npm");
  assert.equal(finding?.severity, "warning");
  assert.equal(result.surfaces.npm.active, true);
  assert.equal(result.surfaces.docker.active, false);
});

test("one path can drift across both Docker and npm surfaces", () => {
  const root = createRepository();
  write(root, ".gitignore", ".env\n");
  write(root, ".dockerignore", ".git\n");
  write(root, "Dockerfile", "FROM scratch\n");
  writeJson(root, "package.json", packageManifest({ files: [".env"] }));
  write(root, ".env", "TOKEN=secret\n");
  trackAll(root);

  const result = scanRepository(root);
  const envFindings = result.findings.filter((item) => item.path === ".env");

  assert.deepEqual(
    envFindings.map((item) => item.surface).sort(),
    ["docker", "npm"],
  );
  assert.equal(envFindings.every((item) => item.severity === "error"), true);
});

test("policy allows intentional drift with a documented reason", () => {
  const root = createRepository();
  write(root, ".gitignore", "dist/\n");
  writeJson(root, "package.json", packageManifest({ files: ["dist"] }));
  write(root, "dist/index.js");
  writeJson(root, ".ignore-drift.json", {
    surfaces: { npm: true, docker: false },
    allow: [
      {
        code: "ID101",
        path: "dist/**",
        reason: "Compiled output is the public package API.",
      },
    ],
  });
  trackAll(root);

  const result = scanRepository(root);

  assert.deepEqual(result.findings, []);
  assert.equal(result.allowedFindings.length, 1);
  assert.equal(result.allowedFindings[0].allowance.reason, "Compiled output is the public package API.");
});

test("custom sensitive patterns promote findings to errors", () => {
  const root = createRepository();
  write(root, ".gitignore", "local/*.vault\n");
  write(root, ".dockerignore", ".git\n");
  write(root, "Dockerfile", "FROM scratch\n");
  write(root, "local/config.vault");
  writeJson(root, ".ignore-drift.json", {
    sensitivePatterns: ["**/*.vault"],
  });
  trackAll(root);

  const result = scanRepository(root);
  assert.equal(result.findings[0].severity, "error");
});

test("does not invent a Docker surface for a non-Docker repository", () => {
  const root = createRepository();
  write(root, "README.md");
  trackAll(root);

  const result = scanRepository(root);

  assert.deepEqual(result.findings, []);
  assert.equal(result.surfaces.docker.active, false);
  assert.equal(result.surfaces.npm.active, false);
  assert.equal(result.stats.pathsScanned, 0);
});

test("an explicitly forced Docker surface catches missing protection", () => {
  const root = createRepository();
  write(root, "README.md");
  trackAll(root);

  const result = scanRepository(root, { surfaces: ["docker"] });
  const finding = result.findings.find((item) => item.path === ".git/");

  assert.equal(finding?.code, "ID001");
  assert.equal(finding?.severity, "error");
});

test("Dockerfile-specific ignore files take precedence", () => {
  const root = createRepository();
  write(root, ".gitignore", ".env\n");
  write(root, ".dockerignore", ".git\n");
  write(root, "Dockerfile", "FROM scratch\n");
  write(root, "Dockerfile.dockerignore", ".git\n.env\n");
  write(root, ".env", "TOKEN=secret\n");
  trackAll(root);

  const result = scanRepository(root);

  assert.equal(result.surfaces.docker.ignoreFile, "Dockerfile.dockerignore");
  assert.equal(result.findings.some((item) => item.path === ".env"), false);
});

test("Docker control files remain exposed even when ignore patterns match", () => {
  const root = createRepository();
  write(root, ".gitignore", "Dockerfile\n.dockerignore\n");
  write(root, ".dockerignore", ".git\nDockerfile\n.dockerignore\n");
  write(root, "Dockerfile", "FROM scratch\n");

  const result = scanRepository(root);

  assert.deepEqual(
    result.findings.map((item) => item.path).sort(),
    [".dockerignore", "Dockerfile"],
  );
  assert.equal(
    explainPath("Dockerfile", { startDirectory: root, baseDirectory: root })
      .surfaces.docker.source.pattern,
    "control files are always sent to the builder",
  );
});

test("an explicitly selected nested Dockerfile uses its adjacent ignore file", () => {
  const root = createRepository();
  write(root, ".gitignore", ".env\n");
  write(root, ".dockerignore", ".git\n");
  write(root, "docker/release.Dockerfile", "FROM scratch\n");
  write(root, "docker/release.Dockerfile.dockerignore", ".git\n.env\n");
  write(root, ".env", "TOKEN=secret\n");
  trackAll(root);

  const result = scanRepository(root, {
    dockerfile: "docker/release.Dockerfile",
  });

  assert.equal(
    result.surfaces.docker.ignoreFile,
    "docker/release.Dockerfile.dockerignore",
  );
  assert.equal(result.findings.some((item) => item.path === ".env"), false);
});

test("Docker negations preserve file-level exposure findings", () => {
  const root = createRepository();
  write(root, ".gitignore", "secrets/\n");
  write(root, ".dockerignore", ".git\nsecrets\n!secrets/public.txt\n");
  write(root, "Dockerfile", "FROM scratch\n");
  write(root, "secrets/public.txt", "intentionally copied\n");
  write(root, "secrets/private.txt", "not copied\n");
  trackAll(root);

  const result = scanRepository(root);

  assert.equal(
    result.findings.some((item) => item.path === "secrets/public.txt"),
    true,
  );
  assert.equal(
    result.findings.some((item) => item.path === "secrets/private.txt"),
    false,
  );
});

test("npm inventory never executes lifecycle scripts", () => {
  const root = createRepository();
  writeJson(
    root,
    "package.json",
    packageManifest({
      scripts: {
        prepack: "node -e \"require('node:fs').writeFileSync('script-ran', 'yes')\"",
      },
    }),
  );
  trackAll(root);

  scanRepository(root, { surfaces: ["npm"] });

  assert.equal(fs.existsSync(path.join(root, "script-ran")), false);
});

test("private applications do not enable npm publishing checks automatically", () => {
  const root = createRepository();
  writeJson(root, "package.json", packageManifest({ private: true }));
  trackAll(root);

  const automatic = scanRepository(root);
  const forced = scanRepository(root, { surfaces: ["npm"] });

  assert.equal(automatic.surfaces.npm.active, false);
  assert.equal(forced.surfaces.npm.active, true);
});

test("explain reports every active surface and Git rule provenance", () => {
  const root = createRepository();
  write(root, ".gitignore", "*.pem\n");
  write(root, ".dockerignore", ".git\n");
  write(root, "Dockerfile", "FROM scratch\n");
  writeJson(root, "package.json", packageManifest({ files: ["private.pem"] }));
  write(root, "private.pem");
  trackAll(root);

  const result = explainPath("private.pem", {
    startDirectory: root,
    baseDirectory: root,
  });

  assert.equal(result.git.ignored, true);
  assert.equal(result.git.source.file, ".gitignore");
  assert.equal(result.git.source.line, 1);
  assert.equal(result.surfaces.docker.status, "included");
  assert.equal(result.surfaces.npm.status, "included");
  assert.deepEqual(
    result.findings.map((item) => item.code).sort(),
    ["ID001", "ID101"],
  );
});

test("invalid policy fails closed", () => {
  const root = createRepository();
  writeJson(root, ".ignore-drift.json", {
    allow: [{ path: "dist/**" }],
  });
  trackAll(root);

  assert.throws(
    () => scanRepository(root),
    /allow\[0\]\.reason must explain why the drift is intentional/,
  );
});

test("path limits fail closed instead of returning an incomplete audit", () => {
  const root = createRepository();
  write(root, "Dockerfile", "FROM scratch\n");
  write(root, "one.txt");
  write(root, "two.txt");
  trackAll(root);

  assert.throws(
    () => scanRepository(root, { maxPaths: 1 }),
    /Increase the limit so the audit is complete/,
  );
});
