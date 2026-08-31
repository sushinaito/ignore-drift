import fs from "node:fs";
import path from "node:path";

import { IgnoreDriftError } from "./errors.js";
import { loadDockerIgnore } from "./docker.js";
import {
  findRepositoryRoot,
  getGitPathState,
  listGitPaths,
} from "./git.js";

const SENSITIVE_BASENAMES = new Set([
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "id_dsa",
  "id_ed25519",
  "id_rsa",
  "secrets.json",
]);
const SENSITIVE_EXTENSIONS = new Set([".key", ".p12", ".pem", ".pfx"]);

function normalizedPath(pathname) {
  return pathname.replaceAll(path.sep, "/");
}

function canonicalPath(pathname) {
  const absolute = path.resolve(pathname);
  const missingSegments = [];
  let existingAncestor = absolute;

  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) return absolute;
    missingSegments.unshift(path.basename(existingAncestor));
    existingAncestor = parent;
  }

  return path.join(fs.realpathSync(existingAncestor), ...missingSegments);
}

function isSensitive(pathname) {
  const normalized = normalizedPath(pathname).replace(/\/$/, "");
  const segments = normalized.split("/");
  const basename = segments.at(-1).toLowerCase();
  const extension = path.posix.extname(basename);

  return (
    normalized === ".git" ||
    normalized.startsWith(".git/") ||
    segments.includes(".aws") ||
    segments.includes(".ssh") ||
    basename === ".env" ||
    basename.startsWith(".env.") ||
    basename.includes("secret") ||
    SENSITIVE_BASENAMES.has(basename) ||
    SENSITIVE_EXTENSIONS.has(extension)
  );
}

function dockerBoundary(pathname, dockerIgnore) {
  const normalized = normalizedPath(pathname).replace(/\/$/, "");
  const parts = normalized.split("/");

  for (let index = 1; index < parts.length; index += 1) {
    const ancestor = parts.slice(0, index).join("/");
    if (dockerIgnore.ignores(ancestor)) {
      return `${ancestor}/`;
    }
  }

  return pathname;
}

function comparePath(candidate, dockerIgnore) {
  const dockerIgnored = dockerIgnore.ignores(candidate.path);
  const gitIgnored = candidate.gitStatus === "ignored";

  if (gitIgnored && !dockerIgnored) {
    const sensitive = isSensitive(candidate.path);
    return {
      code: "ID001",
      severity: sensitive ? "error" : "warning",
      path: candidate.path,
      git: "ignored",
      docker: "included",
      message: sensitive
        ? "A potentially sensitive Git-ignored path is included in the Docker build context."
        : "A Git-ignored path is included in the Docker build context.",
      suggestion: `Add ${JSON.stringify(candidate.path)} to .dockerignore or explicitly accept the mismatch.`,
    };
  }

  if (!gitIgnored && dockerIgnored) {
    const boundary = dockerBoundary(candidate.path, dockerIgnore);
    return {
      code: "ID002",
      severity: "warning",
      path: boundary,
      samplePath: boundary === candidate.path ? undefined : candidate.path,
      git: candidate.gitStatus,
      docker: "ignored",
      message: "A Git-visible path is excluded from the Docker build context.",
      suggestion:
        "Confirm Docker does not COPY this path, or narrow the matching .dockerignore rule.",
    };
  }

  return null;
}

export function scanRepository(startDirectory = process.cwd(), options = {}) {
  const root = findRepositoryRoot(startDirectory);
  const dockerIgnore = loadDockerIgnore(root);
  const listing = listGitPaths(root, options);
  const findings = [];
  const seen = new Set();

  for (const candidate of listing.paths) {
    const finding = comparePath(candidate, dockerIgnore);
    if (!finding) continue;

    const key = `${finding.code}:${finding.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      findings.push(finding);
    }
  }

  const severityOrder = { error: 0, warning: 1 };
  findings.sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity] ||
      left.path.localeCompare(right.path),
  );

  return {
    schemaVersion: 1,
    root,
    dockerignore: {
      exists: dockerIgnore.exists,
      path: path.relative(root, dockerIgnore.filename) || ".dockerignore",
    },
    stats: {
      pathsScanned: listing.paths.length,
      totalPaths: listing.totalPaths,
      truncated: listing.truncated,
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
    },
    findings,
  };
}

export function explainPath(
  target,
  { startDirectory = process.cwd(), baseDirectory = process.cwd() } = {},
) {
  const root = findRepositoryRoot(startDirectory);
  const canonicalBase = canonicalPath(baseDirectory);
  const absoluteTarget = canonicalPath(
    path.isAbsolute(target) ? target : path.resolve(canonicalBase, target),
  );
  const relative = normalizedPath(path.relative(root, absoluteTarget));

  if (!relative || relative === "." || relative.startsWith("../")) {
    throw new IgnoreDriftError("The explained path must be inside the repository.", {
      code: "PATH_OUTSIDE_REPOSITORY",
    });
  }

  const git = getGitPathState(root, relative);
  const dockerIgnore = loadDockerIgnore(root);
  const docker = dockerIgnore.explain(relative);
  const candidate = { path: relative, gitStatus: git.status };
  const finding = comparePath(candidate, dockerIgnore);

  return {
    schemaVersion: 1,
    root,
    path: relative,
    exists: fs.existsSync(absoluteTarget),
    git,
    docker: {
      ignored: docker.ignored,
      status: docker.ignored ? "ignored" : "included",
      source: docker.source,
      ignoreFileExists: dockerIgnore.exists,
    },
    finding,
  };
}
