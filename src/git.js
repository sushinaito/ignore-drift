import { spawnSync } from "node:child_process";
import path from "node:path";

import { IgnoreDriftError } from "./errors.js";

const MAX_GIT_OUTPUT = 64 * 1024 * 1024;

function runGit(root, args, { allowFailure = false, input } = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    input,
    maxBuffer: MAX_GIT_OUTPUT,
  });

  if (result.error) {
    throw new IgnoreDriftError(`Could not run Git: ${result.error.message}`, {
      code: "GIT_UNAVAILABLE",
      cause: result.error,
    });
  }

  if (result.status !== 0 && !allowFailure) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new IgnoreDriftError(
      detail || `Git exited with status ${result.status}.`,
      { code: "GIT_ERROR" },
    );
  }

  return result;
}

function splitNull(output) {
  return output.split("\0").filter(Boolean);
}

export function findRepositoryRoot(startDirectory = process.cwd()) {
  const start = path.resolve(startDirectory);
  const result = runGit(start, ["rev-parse", "--show-toplevel"]);
  return path.resolve(result.stdout.trim());
}

export function listGitPaths(root, { maxPaths = 50_000 } = {}) {
  const tracked = splitNull(
    runGit(root, ["ls-files", "-z", "--cached"]).stdout,
  );
  const untracked = splitNull(
    runGit(root, ["ls-files", "-z", "--others", "--exclude-standard"])
      .stdout,
  );
  const ignored = splitNull(
    runGit(root, [
      "ls-files",
      "-z",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--directory",
      "--no-empty-directory",
    ]).stdout,
  );

  const paths = new Map();
  for (const pathname of ignored) {
    paths.set(pathname, { path: pathname, gitStatus: "ignored" });
  }
  for (const pathname of untracked) {
    paths.set(pathname, { path: pathname, gitStatus: "untracked" });
  }
  for (const pathname of tracked) {
    paths.set(pathname, { path: pathname, gitStatus: "tracked" });
  }

  // Git never reports its own metadata directory, but a local Docker context can
  // send it unless .dockerignore excludes it.
  paths.set(".git/", { path: ".git/", gitStatus: "ignored" });

  const sorted = [...paths.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );

  return {
    paths: sorted.slice(0, maxPaths),
    totalPaths: sorted.length,
    truncated: sorted.length > maxPaths,
  };
}

export function getGitPathState(root, relativePath) {
  const normalized = relativePath.replaceAll(path.sep, "/").replace(/\/$/, "");

  if (normalized === ".git" || normalized.startsWith(".git/")) {
    return {
      ignored: true,
      status: "ignored",
      source: { file: "Git metadata", line: null, pattern: ".git/" },
    };
  }

  const tracked = runGit(
    root,
    ["ls-files", "--error-unmatch", "--", normalized],
    { allowFailure: true },
  );
  if (tracked.status === 0) {
    return {
      ignored: false,
      status: "tracked",
      source: { file: "Git index", line: null, pattern: null },
    };
  }

  const ignored = runGit(
    root,
    ["check-ignore", "-z", "-v", "--no-index", "--stdin"],
    { allowFailure: true, input: `${normalized}\0` },
  );
  const fields = splitNull(ignored.stdout);
  if (ignored.status === 0 && fields.length >= 4) {
    return {
      ignored: true,
      status: "ignored",
      source: {
        file: fields[0],
        line: Number.parseInt(fields[1], 10) || null,
        pattern: fields[2],
      },
    };
  }

  return {
    ignored: false,
    status: "untracked",
    source: null,
  };
}
