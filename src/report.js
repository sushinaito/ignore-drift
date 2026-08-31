import { VERSION } from "./version.js";

const SEVERITY_RANK = { never: Number.POSITIVE_INFINITY, error: 2, warning: 1 };

const RULES = {
  ID001: {
    name: "git-ignored-docker-exposure",
    description: "A Git-ignored path is included in the Docker build context.",
  },
  ID101: {
    name: "git-ignored-npm-exposure",
    description: "A Git-ignored path is included in the npm package.",
  },
};

function sourceLabel(source) {
  if (!source) return "no matching rule";
  const line = source.line ? `:${source.line}` : "";
  const pattern = source.pattern ? ` (${JSON.stringify(source.pattern)})` : "";
  return `${source.file}${line}${pattern}`;
}

function activeSurfaceLabels(result) {
  const labels = [];
  if (result.surfaces.docker.active) {
    labels.push(
      result.surfaces.docker.ignoreFile
        ? `Docker via ${result.surfaces.docker.ignoreFile}`
        : "Docker without .dockerignore",
    );
  }
  if (result.surfaces.npm.active) labels.push(`npm ${result.surfaces.npm.package}`);
  return labels;
}

function formatFinding(lines, finding, prefix = finding.severity.toUpperCase()) {
  lines.push(
    `${prefix} ${finding.code} ${finding.path} [${finding.surface}]`,
    `  ${finding.message}`,
  );
  if (finding.allowance) lines.push(`  Allowed: ${finding.allowance.reason}`);
  else lines.push(`  Fix: ${finding.suggestion}`);
  lines.push("");
}

export function shouldFail(findings, failOn) {
  const threshold = SEVERITY_RANK[failOn];
  return findings.some(
    (finding) => SEVERITY_RANK[finding.severity] >= threshold,
  );
}

export function formatScan(result, { showAllowed = false } = {}) {
  const surfaces = activeSurfaceLabels(result);
  const lines = [];

  if (result.findings.length === 0) {
    lines.push("ignore-drift: no unapproved exposure drift found.");
  } else {
    lines.push(
      `ignore-drift: ${result.findings.length} finding${result.findings.length === 1 ? "" : "s"} (${result.stats.errors} error, ${result.stats.warnings} warning)`,
      "",
    );
    for (const finding of result.findings) formatFinding(lines, finding);
  }

  if (showAllowed && result.allowedFindings.length > 0) {
    lines.push(`Intentional drift (${result.allowedFindings.length}):`, "");
    for (const finding of result.allowedFindings) {
      formatFinding(lines, finding, "ALLOW");
    }
  }

  lines.push(
    surfaces.length > 0
      ? `Surfaces: ${surfaces.join(", ")}`
      : "Surfaces: none detected (use --surface docker or --surface npm to force one)",
    `Scanned ${result.stats.pathsScanned} Git paths in ${result.root}`,
  );
  if (result.stats.allowed > 0 && !showAllowed) {
    lines.push(`${result.stats.allowed} intentional finding(s) allowed by policy.`);
  }
  return lines.join("\n");
}

export function formatExplanation(result) {
  const gitStatus = result.git.ignored ? "ignored" : result.git.status;
  const lines = [
    result.path,
    `  Git:    ${gitStatus} — ${sourceLabel(result.git.source)}`,
  ];

  if (result.surfaces.docker.active) {
    lines.push(
      `  Docker: ${result.surfaces.docker.status} — ${sourceLabel(result.surfaces.docker.source)}`,
    );
  } else lines.push("  Docker: inactive");
  if (result.surfaces.npm.active) {
    lines.push(
      `  npm:    ${result.surfaces.npm.status} — ${result.surfaces.npm.package}`,
    );
  } else lines.push("  npm:    inactive");

  if (result.findings.length === 0) lines.push("  Result: no exposure drift");
  else {
    for (const finding of result.findings) {
      lines.push(
        `  Result: ${finding.allowed ? "ALLOWED" : finding.severity.toUpperCase()} ${finding.code} [${finding.surface}] — ${finding.message}`,
      );
      if (finding.allowance) lines.push(`  Reason: ${finding.allowance.reason}`);
    }
  }
  if (!result.exists) lines.push("  Note: the path does not currently exist.");
  return lines.join("\n");
}

function commandEscape(value) {
  return String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function propertyEscape(value) {
  return commandEscape(value)
    .replaceAll(":", "%3A")
    .replaceAll(",", "%2C");
}

export function formatGitHub(result) {
  if (result.findings.length === 0) {
    return "::notice title=ignore-drift::No unapproved exposure drift found.";
  }
  return result.findings
    .map((finding) => {
      const level = finding.severity === "error" ? "error" : "warning";
      const title = propertyEscape(`${finding.code} ${finding.surface} exposure`);
      const file = propertyEscape(finding.path.replace(/\/$/, ""));
      return `::${level} file=${file},title=${title}::${commandEscape(finding.message)}`;
    })
    .join("\n");
}

export function formatSarif(result) {
  const usedRules = [...new Set(result.findings.map((finding) => finding.code))];
  return JSON.stringify(
    {
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "ignore-drift",
              version: VERSION,
              informationUri: "https://github.com/sushinaito/ignore-drift",
              rules: usedRules.map((code) => ({
                id: code,
                name: RULES[code]?.name || code,
                shortDescription: {
                  text: RULES[code]?.description || "Ignore exposure drift",
                },
              })),
            },
          },
          results: result.findings.map((finding) => ({
            ruleId: finding.code,
            level: finding.severity,
            message: { text: `${finding.message} ${finding.suggestion}` },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: finding.path.replace(/\/$/, "") },
                },
              },
            ],
            properties: { surface: finding.surface },
          })),
        },
      ],
    },
    null,
    2,
  );
}
