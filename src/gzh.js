import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PYTHON_CANDIDATES = process.env.GZH_PYTHON
  ? [process.env.GZH_PYTHON]
  : process.platform === "win32"
    ? ["python", "py", "python3"]
    : ["python3", "python"];

export function validateGzhHtml(html, rootDir = projectRoot) {
  const script = path.join(rootDir, "vendor", "gzh-design-skill", "scripts", "validate_gzh_html.py");
  return new Promise((resolve, reject) => {
    let settled = false;
    let lastError = null;
    let tried = 0;

    const tryNext = () => {
      if (settled) return;
      if (tried >= PYTHON_CANDIDATES.length) {
        settled = true;
        return reject(lastError || new Error("未找到可用的 Python 解释器（可设置 GZH_PYTHON 指定）"));
      }
      const bin = PYTHON_CANDIDATES[tried];
      tried += 1;
      let stdout = "";
      let stderr = "";
      const child = spawn(bin, [script, "--stdin"], { stdio: ["pipe", "pipe", "pipe"] });
      child.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
      child.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
      child.on("error", (error) => {
        lastError = error;
        tryNext();
      });
      child.on("close", (code) => {
        if (settled) return;
        if (code === 0 && !/WARNING/i.test(stdout)) {
          settled = true;
          const match = stdout.match(/span leaf 包裹:\s*(\d+)\s*处/);
          return resolve({ output: stdout.trim(), leafCount: Number(match?.[1] || 0), python: bin });
        }
        lastError = new Error(`公众号排版校验失败：${(stderr || stdout).trim()}`);
        if (tried < PYTHON_CANDIDATES.length) return tryNext();
        settled = true;
        reject(lastError);
      });
      child.stdin.end(html);
    };

    tryNext();
  });
}
