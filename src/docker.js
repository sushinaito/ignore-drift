import fs from "node:fs";
import path from "node:path";

import createDockerIgnore from "@balena/dockerignore";

function normalizePath(pathname) {
  return pathname.replaceAll(path.sep, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function parseRules(content) {
  return content.split(/\r?\n/).map((pattern, index) => ({
    line: index + 1,
    pattern,
  }));
}

export function loadDockerIgnore(root) {
  const filename = path.join(root, ".dockerignore");
  const exists = fs.existsSync(filename);
  const content = exists ? fs.readFileSync(filename, "utf8") : "";
  const matcher = createDockerIgnore({ ignorecase: false }).add(content);
  const rules = parseRules(content);

  return {
    exists,
    filename,
    rules,
    ignores(pathname) {
      const normalized = normalizePath(pathname);
      return normalized.length > 0 && matcher.ignores(normalized);
    },
    explain(pathname) {
      const normalized = normalizePath(pathname);
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
              file: ".dockerignore",
              line: decisiveRule.line,
              pattern: decisiveRule.pattern,
            }
          : null,
      };
    },
  };
}
