import fs from "node:fs";
import path from "node:path";

import { CONFIG_FILENAME, defaultConfigText } from "./config.js";
import { IgnoreDriftError } from "./errors.js";
import { findRepositoryRoot } from "./git.js";
import {
  formatExplanation,
  formatGitHub,
  formatSarif,
  formatScan,
  shouldFail,
} from "./report.js";
import { explainPath, scanRepository } from "./scanner.js";
import { VERSION } from "./version.js";

const FORMATS = new Set(["human", "json", "sarif", "github"]);

const HELP = `ignore-drift ${VERSION}

Audit which Git-ignored files escape into Docker contexts and npm packages.

Usage:
  ignore-drift [check] [directory] [options]
  ignore-drift explain <path> [--root <directory>] [options]
  ignore-drift init [directory]

Options:
  --surface <name>    Force docker or npm; repeat or comma-separate
  --dockerfile <path> Select Dockerfile and its effective ignore file
  --format <format>   human, json, sarif, or github (default: human)
  --json              Alias for --format json
  --config <path>     Use an explicit policy file
  --show-allowed      Show policy-approved findings in human output
  --fail-on <level>   Exit 1 for error, warning, or never (default: error)
  --max-paths <n>     Maximum Git paths to inspect (default: 50000)
  --root <directory>  Repository directory for explain
  -h, --help          Show help
  -v, --version       Show version

Exit codes:
  0  No unapproved finding at or above --fail-on
  1  Unapproved finding at or above --fail-on
  2  Usage, configuration, repository, Git, or npm error`;

function parseArguments(argv) {
  const options = {
    format: "human",
    formatSpecified: false,
    failOn: "error",
    maxPaths: 50_000,
    root: null,
    config: null,
    dockerfile: null,
    surfaces: [],
    showAllowed: false,
    help: false,
    version: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      if (options.formatSpecified && options.format !== "json") {
        throw new IgnoreDriftError("--json conflicts with --format.");
      }
      options.format = "json";
      options.formatSpecified = true;
    } else if (argument === "--show-allowed") options.showAllowed = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--version" || argument === "-v") options.version = true;
    else if (
      ["--fail-on", "--max-paths", "--root", "--config", "--surface", "--format", "--dockerfile"].includes(
        argument,
      )
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new IgnoreDriftError(`${argument} requires a value.`);
      }
      index += 1;
      if (argument === "--fail-on") options.failOn = value;
      if (argument === "--root") options.root = value;
      if (argument === "--config") options.config = value;
      if (argument === "--dockerfile") options.dockerfile = value;
      if (argument === "--surface") {
        options.surfaces.push(...value.split(",").filter(Boolean));
      }
      if (argument === "--format") {
        if (options.formatSpecified && options.format !== value) {
          throw new IgnoreDriftError("--format was specified more than once.");
        }
        options.format = value;
        options.formatSpecified = true;
      }
      if (argument === "--max-paths") options.maxPaths = Number.parseInt(value, 10);
    } else if (argument.startsWith("-")) {
      throw new IgnoreDriftError(`Unknown option: ${argument}`);
    } else positional.push(argument);
  }

  if (!["error", "warning", "never"].includes(options.failOn)) {
    throw new IgnoreDriftError("--fail-on must be one of: error, warning, never.");
  }
  if (!FORMATS.has(options.format)) {
    throw new IgnoreDriftError("--format must be one of: human, json, sarif, github.");
  }
  if (!Number.isSafeInteger(options.maxPaths) || options.maxPaths < 1) {
    throw new IgnoreDriftError("--max-paths must be a positive integer.");
  }
  return { options, positional };
}

function scanOutput(result, options) {
  if (options.format === "json") return JSON.stringify(result, null, 2);
  if (options.format === "sarif") return formatSarif(result);
  if (options.format === "github") return formatGitHub(result);
  return formatScan(result, { showAllowed: options.showAllowed });
}

function initializeConfig(directory) {
  const root = findRepositoryRoot(directory);
  const filename = path.join(root, CONFIG_FILENAME);
  try {
    fs.writeFileSync(filename, defaultConfigText(), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new IgnoreDriftError(`${CONFIG_FILENAME} already exists.`, {
        code: "CONFIG_EXISTS",
      });
    }
    throw error;
  }
  return filename;
}

export function runCli(
  argv,
  { stdout = process.stdout, stderr = process.stderr, cwd = process.cwd() } = {},
) {
  try {
    const { options, positional } = parseArguments(argv);
    if (options.help) {
      stdout.write(`${HELP}\n`);
      return 0;
    }
    if (options.version) {
      stdout.write(`${VERSION}\n`);
      return 0;
    }

    const command = ["check", "explain", "init"].includes(positional[0])
      ? positional[0]
      : "check";
    const commandArguments = command === "check" && positional[0] !== "check"
      ? positional
      : positional.slice(1);

    if (command === "init") {
      if (commandArguments.length > 1) {
        throw new IgnoreDriftError("init accepts at most one directory.");
      }
      const filename = initializeConfig(commandArguments[0] || cwd);
      stdout.write(`Created ${filename}\n`);
      return 0;
    }

    const commonOptions = {
      maxPaths: options.maxPaths,
      surfaces: options.surfaces,
      configPath: options.config ? path.resolve(cwd, options.config) : undefined,
      dockerfile: options.dockerfile,
      baseDirectory: cwd,
    };

    if (command === "explain") {
      if (commandArguments.length !== 1) {
        throw new IgnoreDriftError("explain requires exactly one path.");
      }
      if (!["human", "json"].includes(options.format)) {
        throw new IgnoreDriftError("explain supports only human and json formats.");
      }
      const result = explainPath(commandArguments[0], {
        startDirectory: options.root || cwd,
        baseDirectory: cwd,
        ...commonOptions,
      });
      stdout.write(
        options.format === "json"
          ? `${JSON.stringify(result, null, 2)}\n`
          : `${formatExplanation(result)}\n`,
      );
      const unapproved = result.findings.filter((finding) => !finding.allowed);
      return shouldFail(unapproved, options.failOn) ? 1 : 0;
    }

    if (commandArguments.length > 1) {
      throw new IgnoreDriftError("check accepts at most one directory.");
    }
    if (options.root) throw new IgnoreDriftError("--root is only valid with explain.");
    const result = scanRepository(commandArguments[0] || cwd, commonOptions);
    stdout.write(`${scanOutput(result, options)}\n`);
    return shouldFail(result.findings, options.failOn) ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`ignore-drift: ${message}\n`);
    return 2;
  }
}
