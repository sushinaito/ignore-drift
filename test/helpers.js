import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function createRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ignore-drift-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Ignore Drift Tests"], { cwd: root });
  return root;
}

export function write(root, filename, content = "fixture\n") {
  const target = path.join(root, filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

export function writeJson(root, filename, value) {
  return write(root, filename, `${JSON.stringify(value, null, 2)}\n`);
}

export function trackAll(root) {
  execFileSync("git", ["add", "."], { cwd: root });
}

export function sink() {
  let value = "";
  return {
    stream: {
      write(chunk) {
        value += chunk;
      },
    },
    read() {
      return value;
    },
  };
}
