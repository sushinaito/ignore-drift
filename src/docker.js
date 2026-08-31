import fs from "node:fs";
import path from "node:path";

import createDockerIgnore from "@balena/dockerignore";

import { IgnoreDriftError } from "./errors.js";

function normalizePath(pathname) {
  return pathname.replaceAll(path.sep, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function parseRules(content) {
  return content.split(/\r?\n/).map((pattern, index) => ({
    line: index + 1,
    pattern,
  }));
}

export function loadDockerIgnore(root, { dockerfile } = {}) {
  let dockerfilePath = dockerfile ? path.resolve(dockerfile) : null;
  if (!dockerfilePath) {
    for (const candidate of ["Dockerfile", "Containerfile"]) {
      const possible = path.join(root, candidate);
      if (fs.existsSync(possible)) {
        dockerfilePath = possible;
        break;
      }
    }
  }
  if (dockerfile && !fs.existsSync(dockerfilePath)) {
    throw new IgnoreDriftError(`Dockerfile not found: ${dockerfilePath}`, {
      code: "DOCKERFILE_NOT_FOUND",
    });
  }

  const rootIgnore = path.join(root, ".dockerignore");
  const specificIgnore = dockerfilePath ? `${dockerfilePath}.dockerignore` : null;
  const filename = specificIgnore && fs.existsSync(specificIgnore)
    ? specificIgnore
    : rootIgnore;
  const exists = fs.existsSync(filename);
  const content = exists ? fs.readFileSync(filename, "utf8") : "";
  const sourceName = normalizedRelative(root, filename);
  const dockerfileName = dockerfilePath
    ? normalizedRelative(root, dockerfilePath)
    : null;
  const controlPaths = new Set(
    [dockerfileName, exists ? sourceName : null].filter(
      (pathname) => pathname && !pathname.startsWith("../"),
    ),
  );
  const matcher = createDockerIgnore({ ignorecase: false }).add(content);
  const rules = parseRules(content);
  const hasNegations = rules.some((rule) => rule.pattern.trimStart().startsWith("!"));

  return {
    exists,
    filename,
    ignoreFile: exists ? sourceName : null,
    dockerfile: dockerfileName,
    rules,
    hasNegations,
    ignores(pathname) {
      const normalized = normalizePath(pathname);
      return (
        normalized.length > 0 &&
        !controlPaths.has(normalized) &&
        matcher.ignores(normalized)
      );
    },
    explain(pathname) {
      const normalized = normalizePath(pathname);
      if (controlPaths.has(normalized)) {
        return {
          ignored: false,
          source: {
            file: "Docker context",
            line: null,
            pattern: "control files are always sent to the builder",
          },
        };
      }
      let previous = false;
      let decisiveRule = null;
      const cumulative = createDockerIgnore({ ignorecase: false });

      for (const rule of rules) {
        cumulative.add(rule.pattern);
        const current = normalized.length > 0 && cumulative.ignores(normalized);
        if (current !== previous) {
          decisiveRule = rule;
          previous = current;
        }
      }

      return {
        ignored: normalized.length > 0 && matcher.ignores(normalized),
        source: decisiveRule
          ? {
              file: sourceName,
              line: decisiveRule.line,
              pattern: decisiveRule.pattern,
            }
          : null,
      };
    },
  };
}

function normalizedRelative(root, filename) {
  return path.relative(root, filename).replaceAll(path.sep, "/");
}
