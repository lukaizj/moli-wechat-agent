import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function validateGzhHtml(html, rootDir = projectRoot) {
  const script = path.join(rootDir, "vendor", "gzh-design-skill", "scripts", "validate_gzh_html.py");
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [script, "--stdin"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 || /WARNING/i.test(stdout)) {
        return reject(new Error(`公众号排版校验失败：${(stderr || stdout).trim()}`));
      }
      const match = stdout.match(/span leaf 包裹:\s*(\d+)\s*处/);
      resolve({ output: stdout.trim(), leafCount: Number(match?.[1] || 0) });
    });
    child.stdin.end(html);
  });
}
