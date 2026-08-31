import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function javascriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const pathname = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...javascriptFiles(pathname));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(pathname);
  }
  return files;
}

for (const directory of ["bin", "scripts", "src", "test"]) {
  for (const filename of javascriptFiles(directory)) {
    execFileSync(process.execPath, ["--check", filename], { stdio: "inherit" });
  }
}
