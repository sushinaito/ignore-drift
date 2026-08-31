export type SurfaceName = "docker" | "npm";
export type Severity = "error" | "warning";

export interface ScanOptions {
  maxPaths?: number;
  surfaces?: SurfaceName[];
  configPath?: string;
  dockerfile?: string;
}

export interface Finding {
  code: "ID001" | "ID101";
  surface: SurfaceName;
  severity: Severity;
  path: string;
  git: "ignored";
  exposure: "included";
  message: string;
  suggestion: string;
  allowance?: { path: string; reason: string };
}

export interface ScanResult {
  schemaVersion: 2;
  root: string;
  config: string | null;
  surfaces: {
    docker: { active: boolean; ignoreFile?: string | null; dockerfile?: string | null };
    npm: {
      active: boolean;
      package?: string;
      fileCount?: number;
      unpackedSize?: number;
    };
  };
  stats: {
    pathsScanned: number;
    totalPaths: number;
    truncated: boolean;
    errors: number;
    warnings: number;
    allowed: number;
  };
  findings: Finding[];
  allowedFindings: Finding[];
}

export interface ExplainOptions extends ScanOptions {
  startDirectory?: string;
  baseDirectory?: string;
}

export interface ExplainResult {
  schemaVersion: 2;
  root: string;
  path: string;
  exists: boolean;
  git: {
    ignored: boolean;
    status: "ignored" | "tracked" | "untracked";
    source: { file: string; line: number | null; pattern: string | null } | null;
  };
  surfaces: Record<SurfaceName, Record<string, unknown> & { active: boolean }>;
  findings: Array<Finding & { allowed: boolean }>;
}

export const VERSION: string;
export function scanRepository(
  startDirectory?: string,
  options?: ScanOptions,
): ScanResult;
export function explainPath(target: string, options?: ExplainOptions): ExplainResult;
