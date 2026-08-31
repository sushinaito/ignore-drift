const SEVERITY_RANK = { never: Number.POSITIVE_INFINITY, error: 2, warning: 1 };

function sourceLabel(source) {
  if (!source) return "no matching rule";
  const line = source.line ? `:${source.line}` : "";
  const pattern = source.pattern ? ` (${JSON.stringify(source.pattern)})` : "";
  return `${source.file}${line}${pattern}`;
}

export function shouldFail(findings, failOn) {
  const threshold = SEVERITY_RANK[failOn];
  return findings.some(
    (finding) => SEVERITY_RANK[finding.severity] >= threshold,
  );
}

export function formatScan(result) {
  if (result.findings.length === 0) {
    return [
      "ignore-drift: no Git/Docker ignore drift found.",
      `Scanned ${result.stats.pathsScanned} paths in ${result.root}`,
    ].join("\n");
  }

  const lines = [
    `ignore-drift: ${result.findings.length} finding${result.findings.length === 1 ? "" : "s"} (${result.stats.errors} error, ${result.stats.warnings} warning)`,
    "",
  ];
  for (const finding of result.findings) {
    lines.push(
      `${finding.severity.toUpperCase()} ${finding.code} ${finding.path}`,
      `  ${finding.message}`,
    );
    if (finding.samplePath) lines.push(`  Example: ${finding.samplePath}`);
    lines.push(`  Fix: ${finding.suggestion}`, "");
  }
  lines.push(`Scanned ${result.stats.pathsScanned} paths in ${result.root}`);
  if (result.stats.truncated) {
    lines.push(
      `Warning: path scan truncated (${result.stats.totalPaths} total paths). Increase --max-paths.`,
    );
  }
  return lines.join("\n");
}

export function formatExplanation(result) {
  const gitStatus = result.git.ignored ? "ignored" : result.git.status;
  const lines = [
    result.path,
    `  Git:    ${gitStatus} — ${sourceLabel(result.git.source)}`,
    `  Docker: ${result.docker.status} — ${sourceLabel(result.docker.source)}`,
  ];

  if (result.finding) {
    lines.push(
      `  Result: ${result.finding.severity.toUpperCase()} ${result.finding.code} — ${result.finding.message}`,
    );
  } else {
    lines.push("  Result: aligned");
  }
  if (!result.exists) lines.push("  Note: the path does not currently exist.");

  return lines.join("\n");
}
