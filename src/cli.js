import { IgnoreDriftError } from "./errors.js";
import { formatExplanation, formatScan, shouldFail } from "./report.js";
import { explainPath, scanRepository } from "./scanner.js";

export const VERSION = "0.1.0";

const HELP = `ignore-drift ${VERSION}

Catch mismatches between Git and Docker ignore behavior.

Usage:
  ignore-drift [check] [directory] [options]
  ignore-drift explain <path> [--root <directory>] [--json]

Options:
  --fail-on <level>  Exit 1 for error, warning, or never (default: error)
  --max-paths <n>    Maximum candidate paths to inspect (default: 50000)
  --json             Emit machine-readable JSON
  --root <directory> Repository directory for explain
  -h, --help         Show help
  -v, --version      Show version

Exit codes:
  0  No finding at or above --fail-on
  1  Finding at or above --fail-on
  2  Usage, repository, or Git error`;

function parseArguments(argv) {
  const options = {
    json: false,
    failOn: "error",
    maxPaths: 50_000,
    root: null,
    help: false,
    version: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--version" || argument === "-v") options.version = true;
    else if (["--fail-on", "--max-paths", "--root"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new IgnoreDriftError(`${argument} requires a value.`);
      }
      index += 1;
      if (argument === "--fail-on") options.failOn = value;
      if (argument === "--root") options.root = value;
      if (argument === "--max-paths") {
        options.maxPaths = Number.parseInt(value, 10);
      }
    } else if (argument.startsWith("-")) {
      throw new IgnoreDriftError(`Unknown option: ${argument}`);
    } else {
      positional.push(argument);
    }
  }

  if (!["error", "warning", "never"].includes(options.failOn)) {
    throw new IgnoreDriftError(
      "--fail-on must be one of: error, warning, never.",
    );
  }
  if (!Number.isSafeInteger(options.maxPaths) || options.maxPaths < 1) {
    throw new IgnoreDriftError("--max-paths must be a positive integer.");
  }

  return { options, positional };
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

    const command = positional[0] === "explain" ? "explain" : "check";
    if (command === "explain") {
      if (positional.length !== 2) {
        throw new IgnoreDriftError("explain requires exactly one path.");
      }
      const result = explainPath(positional[1], {
        startDirectory: options.root || cwd,
        baseDirectory: cwd,
      });
      stdout.write(
        options.json
          ? `${JSON.stringify(result, null, 2)}\n`
          : `${formatExplanation(result)}\n`,
      );
      return result.finding && shouldFail([result.finding], options.failOn)
        ? 1
        : 0;
    }

    const checkArguments = positional[0] === "check" ? positional.slice(1) : positional;
    if (checkArguments.length > 1) {
      throw new IgnoreDriftError("check accepts at most one directory.");
    }
    if (options.root) {
      throw new IgnoreDriftError("--root is only valid with explain.");
    }

    const result = scanRepository(checkArguments[0] || cwd, {
      maxPaths: options.maxPaths,
    });
    stdout.write(
      options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : `${formatScan(result)}\n`,
    );
    return shouldFail(result.findings, options.failOn) ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`ignore-drift: ${message}\n`);
    return error instanceof IgnoreDriftError ? 2 : 2;
  }
}
