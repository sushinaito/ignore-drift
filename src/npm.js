import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { IgnoreDriftError } from "./errors.js";

const MAX_NPM_OUTPUT = 64 * 1024 * 1024;

function readPackageJson(root) {
  const filename = path.join(root, "package.json");
  if (!fs.existsSync(filename)) return null;

  try {
    const manifest = JSON.parse(fs.readFileSync(filename, "utf8"));
    return { filename, manifest };
  } catch (error) {
    throw new IgnoreDriftError(
      `Could not parse package.json: ${error instanceof Error ? error.message : String(error)}`,
      { code: "INVALID_PACKAGE_JSON" },
    );
  }
}

export function hasNpmPackage(root) {
  const pkg = readPackageJson(root);
  return Boolean(
    pkg?.manifest?.name &&
      pkg?.manifest?.version &&
      pkg.manifest.private !== true,
  );
}

export function loadNpmPackage(root) {
  const pkg = readPackageJson(root);
  if (!pkg?.manifest?.name || !pkg?.manifest?.version) {
    throw new IgnoreDriftError(
      "The npm surface requires package.json with name and version fields.",
      { code: "NPM_PACKAGE_NOT_FOUND" },
    );
  }

  const npmArguments = ["pack", "--dry-run", "--json", "--ignore-scripts"];
  const executable = process.platform === "win32"
    ? process.env.ComSpec || "cmd.exe"
    : "npm";
  // Windows cannot execute a .cmd shim directly. The command contains only
  // fixed literals; the repository path remains a separate cwd option.
  const commandArguments = process.platform === "win32"
    ? ["/d", "/s", "/c", `npm.cmd ${npmArguments.join(" ")}`]
    : npmArguments;
  const result = spawnSync(
    executable,
    commandArguments,
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: MAX_NPM_OUTPUT,
      env: { ...process.env, npm_config_update_notifier: "false" },
    },
  );

  if (result.error) {
    throw new IgnoreDriftError(`Could not run npm: ${result.error.message}`, {
      code: "NPM_UNAVAILABLE",
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    throw new IgnoreDriftError(
      result.stderr.trim() || result.stdout.trim() || "npm pack --dry-run failed.",
      { code: "NPM_PACK_ERROR" },
    );
  }

  let reports;
  try {
    reports = JSON.parse(result.stdout);
  } catch (error) {
    throw new IgnoreDriftError("npm returned invalid JSON for its package inventory.", {
      code: "NPM_PACK_ERROR",
      cause: error,
    });
  }
  const report = Array.isArray(reports) ? reports[0] : reports;
  if (!report || !Array.isArray(report.files)) {
    throw new IgnoreDriftError("npm did not return a package file inventory.", {
      code: "NPM_PACK_ERROR",
    });
  }

  const files = new Set(
    report.files.map((file) => file.path.replaceAll("\\", "/").replace(/^\.\//, "")),
  );
  const directories = new Set();
  for (const file of files) {
    const segments = file.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join("/"));
    }
  }

  return {
    name: report.name || pkg.manifest.name,
    version: report.version || pkg.manifest.version,
    filename: report.filename,
    fileCount: files.size,
    unpackedSize: report.unpackedSize,
    includes(pathname) {
      const normalized = pathname.replaceAll("\\", "/").replace(/^\.\//, "");
      const withoutSlash = normalized.replace(/\/$/, "");
      return files.has(withoutSlash) || directories.has(withoutSlash);
    },
  };
}
