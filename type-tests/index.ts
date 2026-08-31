import {
  VERSION,
  explainPath,
  scanRepository,
  type ExplainResult,
  type Finding,
  type ScanResult,
} from "ignore-drift";

const scan: ScanResult = scanRepository(".", { surfaces: ["docker", "npm"] });
const explanation: ExplainResult = explainPath(".env");
const findings: Finding[] = scan.findings;

void VERSION;
void explanation;
void findings;
