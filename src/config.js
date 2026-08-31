import fs from "node:fs";
import path from "node:path";

import picomatch from "picomatch";

import { IgnoreDriftError } from "./errors.js";

export const CONFIG_FILENAME = ".ignore-drift.json";

export const DEFAULT_CONFIG = Object.freeze({
  $schema:
    "https://raw.githubusercontent.com/sushinaito/ignore-drift/v1.0.0/schema/ignore-drift.schema.json",
  surfaces: { docker: "auto", npm: "auto" },
  allow: [],
  sensitivePatterns: [],
});

const TOP_LEVEL_KEYS = new Set([
  "$schema",
  "surfaces",
  "allow",
  "sensitivePatterns",
]);
const SURFACE_KEYS = new Set(["docker", "npm"]);
const ALLOW_KEYS = new Set(["code", "surface", "path", "reason"]);

function configError(message) {
  return new IgnoreDriftError(`Invalid ${CONFIG_FILENAME}: ${message}`, {
    code: "INVALID_CONFIG",
  });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSurfaceValue(name, value) {
  if (![true, false, "auto"].includes(value)) {
    throw configError(`surfaces.${name} must be true, false, or "auto".`);
  }
}

function validateConfig(value) {
  if (!isObject(value)) throw configError("the root value must be an object.");

  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL_KEYS.has(key)) throw configError(`unknown property ${JSON.stringify(key)}.`);
  }

  if (value.surfaces !== undefined) {
    if (!isObject(value.surfaces)) throw configError("surfaces must be an object.");
    for (const [name, setting] of Object.entries(value.surfaces)) {
      if (!SURFACE_KEYS.has(name)) {
        throw configError(`unknown surface ${JSON.stringify(name)}.`);
      }
      validateSurfaceValue(name, setting);
    }
  }

  if (value.allow !== undefined) {
    if (!Array.isArray(value.allow)) throw configError("allow must be an array.");
    value.allow.forEach((rule, index) => {
      if (!isObject(rule)) throw configError(`allow[${index}] must be an object.`);
      for (const key of Object.keys(rule)) {
        if (!ALLOW_KEYS.has(key)) {
          throw configError(`allow[${index}] has unknown property ${JSON.stringify(key)}.`);
        }
      }
      if (typeof rule.path !== "string" || rule.path.length === 0) {
        throw configError(`allow[${index}].path must be a non-empty glob.`);
      }
      if (typeof rule.reason !== "string" || rule.reason.trim().length === 0) {
        throw configError(`allow[${index}].reason must explain why the drift is intentional.`);
      }
      if (rule.code !== undefined && typeof rule.code !== "string") {
        throw configError(`allow[${index}].code must be a string.`);
      }
      if (rule.surface !== undefined && !SURFACE_KEYS.has(rule.surface)) {
        throw configError(`allow[${index}].surface must be "docker" or "npm".`);
      }
    });
  }

  if (value.sensitivePatterns !== undefined) {
    if (
      !Array.isArray(value.sensitivePatterns) ||
      value.sensitivePatterns.some(
        (pattern) => typeof pattern !== "string" || pattern.length === 0,
      )
    ) {
      throw configError("sensitivePatterns must be an array of non-empty globs.");
    }
  }
}

export function loadConfig(root, explicitPath) {
  const filename = explicitPath
    ? path.resolve(root, explicitPath)
    : path.join(root, CONFIG_FILENAME);
  if (!fs.existsSync(filename)) {
    if (explicitPath) {
      throw new IgnoreDriftError(`Config file not found: ${filename}`, {
        code: "CONFIG_NOT_FOUND",
      });
    }
    return { ...DEFAULT_CONFIG, surfaces: { ...DEFAULT_CONFIG.surfaces }, filename: null };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    throw configError(error instanceof Error ? error.message : String(error));
  }
  validateConfig(parsed);

  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    surfaces: { ...DEFAULT_CONFIG.surfaces, ...parsed.surfaces },
    allow: parsed.allow || [],
    sensitivePatterns: parsed.sensitivePatterns || [],
    filename,
  };
}

export function findAllowance(finding, rules) {
  return rules.find((rule) => {
    if (rule.code && rule.code !== finding.code) return false;
    if (rule.surface && rule.surface !== finding.surface) return false;
    const matches = picomatch(rule.path, { dot: true });
    const pathname = finding.path.replace(/\/$/, "");
    const directoryBase = rule.path.endsWith("/**")
      ? rule.path.slice(0, -3).replace(/\/$/, "")
      : null;
    return (
      matches(pathname) ||
      matches(`${pathname}/`) ||
      (directoryBase !== null && pathname === directoryBase)
    );
  });
}

export function matchesSensitivePattern(pathname, patterns) {
  const normalized = pathname.replace(/\/$/, "");
  return patterns.some((pattern) =>
    picomatch(pattern, { dot: true, nocase: true })(normalized),
  );
}

export function defaultConfigText() {
  return `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`;
}
