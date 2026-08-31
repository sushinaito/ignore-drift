import fs from "node:fs";
import path from "node:path";

import { findAllowance, loadConfig, matchesSensitivePattern } from "./config.js";
import { loadDockerIgnore } from "./docker.js";
import { IgnoreDriftError } from "./errors.js";
import {
  findRepositoryRoot,
  getGitPathState,
  listGitPaths,
} from "./git.js";
import { hasNpmPackage, loadNpmPackage } from "./npm.js";

const SURFACE_NAMES = new Set(["docker", "npm"]);
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

function isSensitive(pathname, customPatterns) {
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
    SENSITIVE_EXTENSIONS.has(extension) ||
    matchesSensitivePattern(normalized, customPatterns)
  );
}

function hasDockerSurface(root) {
  if (fs.existsSync(path.join(root, ".dockerignore"))) return true;
  return ["Dockerfile", "Containerfile"].some((filename) =>
    fs.existsSync(path.join(root, filename)),
  );
}

function normalizeForcedSurfaces(surfaces) {
  if (!surfaces || surfaces.length === 0) return null;
  const normalized = new Set(surfaces);
  for (const surface of normalized) {
    if (!SURFACE_NAMES.has(surface)) {
      throw new IgnoreDriftError(`Unknown surface: ${surface}`, {
        code: "UNKNOWN_SURFACE",
      });
    }
  }
  return normalized;
}

function surfaceEnabled(name, detected, config, forced) {
  if (forced) return forced.has(name);
  const setting = config.surfaces[name];
  return setting === true || (setting === "auto" && detected);
}

function prepareSurfaces(root, config, options) {
  const forced = normalizeForcedSurfaces(options.surfaces);
  const dockerActive = Boolean(options.dockerfile) || surfaceEnabled(
    "docker",
    hasDockerSurface(root),
    config,
    forced,
  );
  const npmActive = surfaceEnabled("npm", hasNpmPackage(root), config, forced);
  const docker = dockerActive
    ? loadDockerIgnore(root, {
        dockerfile: options.dockerfile
          ? path.resolve(root, options.dockerfile)
          : undefined,
      })
    : null;
  const npm = npmActive ? loadNpmPackage(root) : null;

  return { docker, npm };
}

function exposureBoundary(pathname, surface, ignoredDirectories) {
  if (pathname.endsWith("/")) return pathname;
  const boundary = ignoredDirectories.find(
    (directory) => pathname.startsWith(directory) && surface.includes(directory),
  );
  return boundary || pathname;
}

function createExposureFinding(candidate, surface, customPatterns, ignoredDirectories) {
  if (candidate.gitStatus !== "ignored") return null;

  const sensitive = isSensitive(candidate.path, customPatterns);
  const findingPath = sensitive
    ? candidate.path
    : exposureBoundary(candidate.path, surface, ignoredDirectories);
  if (surface.name === "docker" && surface.includes(candidate.path)) {
    return {
      code: "ID001",
      surface: "docker",
      severity: sensitive ? "error" : "warning",
      path: findingPath,
      git: "ignored",
      exposure: "included",
      message: sensitive
        ? "A potentially sensitive Git-ignored path is exposed to the Docker build context."
        : "A Git-ignored path is exposed to the Docker build context.",
      suggestion:
        "Exclude the path in .dockerignore, or allow it in .ignore-drift.json with a reason.",
    };
  }

  if (surface.name === "npm" && surface.includes(candidate.path)) {
    return {
      code: "ID101",
      surface: "npm",
      severity: sensitive ? "error" : "warning",
      path: findingPath,
      git: "ignored",
      exposure: "included",
      message: sensitive
        ? "A potentially sensitive Git-ignored path is exposed to the npm package."
        : "A Git-ignored path is exposed to the npm package.",
      suggestion:
        "Adjust package.json files/.npmignore, or allow it in .ignore-drift.json with a reason.",
    };
  }

  return null;
}

function serializableSurfaces(surfaces) {
  return {
    docker: surfaces.docker
      ? {
          active: true,
          ignoreFile: surfaces.docker.ignoreFile,
          dockerfile: surfaces.docker.dockerfile,
        }
      : { active: false },
    npm: surfaces.npm
      ? {
          active: true,
          package: `${surfaces.npm.name}@${surfaces.npm.version}`,
          fileCount: surfaces.npm.fileCount,
          unpackedSize: surfaces.npm.unpackedSize,
        }
      : { active: false },
  };
}

function compareCandidate(candidate, surfaces, config, ignoredDirectories = []) {
  const findings = [];
  if (surfaces.docker) {
    const finding = createExposureFinding(
      candidate,
      { name: "docker", includes: (pathname) => !surfaces.docker.ignores(pathname) },
      config.sensitivePatterns,
      ignoredDirectories,
    );
    if (finding) findings.push(finding);
  }
  if (surfaces.npm) {
    const finding = createExposureFinding(
      candidate,
      { name: "npm", includes: (pathname) => surfaces.npm.includes(pathname) },
      config.sensitivePatterns,
      ignoredDirectories,
    );
    if (finding) findings.push(finding);
  }
  return findings;
}

export function scanRepository(startDirectory = process.cwd(), options = {}) {
  const root = findRepositoryRoot(startDirectory);
  const config = loadConfig(root, options.configPath);
  const surfaces = prepareSurfaces(root, config, options);
  const hasActiveSurface = Boolean(surfaces.docker || surfaces.npm);
  const listing = hasActiveSurface
    ? listGitPaths(root, {
        ...options,
        ignoredDirectoryFilter(directory) {
          return Boolean(
            (surfaces.docker &&
              (!surfaces.docker.ignores(directory) || surfaces.docker.hasNegations)) ||
              (surfaces.npm && surfaces.npm.includes(directory)),
          );
        },
      })
    : {
        paths: [],
        totalPaths: 0,
        truncated: false,
        ignoredDirectories: [],
      };
  if (listing.truncated) {
    throw new IgnoreDriftError(
      `The repository has ${listing.totalPaths} candidate paths, exceeding --max-paths ${listing.paths.length}. Increase the limit so the audit is complete.`,
      { code: "PATH_LIMIT_EXCEEDED" },
    );
  }
  const findings = [];
  const allowedFindings = [];
  const seen = new Set();

  for (const candidate of listing.paths) {
    for (const finding of compareCandidate(
      candidate,
      surfaces,
      config,
      listing.ignoredDirectories,
    )) {
      const key = `${finding.code}:${finding.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const allowance = findAllowance(finding, config.allow);
      if (allowance) {
        allowedFindings.push({
          ...finding,
          allowance: {
            path: allowance.path,
            reason: allowance.reason,
          },
        });
      } else {
        findings.push(finding);
      }
    }
  }

  const severityOrder = { error: 0, warning: 1 };
  const bySeverityAndPath = (left, right) =>
    severityOrder[left.severity] - severityOrder[right.severity] ||
    left.path.localeCompare(right.path) ||
    left.surface.localeCompare(right.surface);
  findings.sort(bySeverityAndPath);
  allowedFindings.sort(bySeverityAndPath);

  return {
    schemaVersion: 2,
    root,
    config: config.filename ? normalizedPath(path.relative(root, config.filename)) : null,
    surfaces: serializableSurfaces(surfaces),
    stats: {
      pathsScanned: listing.paths.length,
      totalPaths: listing.totalPaths,
      truncated: listing.truncated,
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
      allowed: allowedFindings.length,
    },
    findings,
    allowedFindings,
  };
}

export function explainPath(
  target,
  {
    startDirectory = process.cwd(),
    baseDirectory = process.cwd(),
    ...options
  } = {},
) {
  const root = findRepositoryRoot(startDirectory);
  const config = loadConfig(root, options.configPath);
  const surfaces = prepareSurfaces(root, config, options);
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
  const docker = surfaces.docker?.explain(relative) || null;
  const npmIncluded = surfaces.npm ? surfaces.npm.includes(relative) : null;
  const candidate = { path: relative, gitStatus: git.status };
  const rawFindings = compareCandidate(candidate, surfaces, config);
  const findings = rawFindings.map((finding) => {
    const allowance = findAllowance(finding, config.allow);
    return allowance
      ? {
          ...finding,
          allowed: true,
          allowance: { path: allowance.path, reason: allowance.reason },
        }
      : { ...finding, allowed: false };
  });

  return {
    schemaVersion: 2,
    root,
    path: relative,
    exists: fs.existsSync(absoluteTarget),
    git,
    surfaces: {
      docker: surfaces.docker
        ? {
            active: true,
            status: docker.ignored ? "excluded" : "included",
            source: docker.source,
          }
        : { active: false },
      npm: surfaces.npm
        ? {
            active: true,
            status: npmIncluded ? "included" : "excluded",
            package: `${surfaces.npm.name}@${surfaces.npm.version}`,
          }
        : { active: false },
    },
    findings,
  };
}
