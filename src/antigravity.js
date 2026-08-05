import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { runCodexImage, runCodexStructured } from "./codex.js";
import { runDeepSeekStructured } from "./deepseek.js";

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
    const timer = setTimeout(() => child.kill("SIGTERM"), options.timeout || 6000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`command exited with ${code ?? signal}: ${stderr}`));
    });
  });
}

export async function checkAntigravityAvailable(config = {}) {
  try {
    const cmd = config.antigravityPath || "gemini";
    await runCommand(cmd, ["--version"], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export async function runAntigravityImage(prompt, outputPath, config = {}) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  if (config.codexLoggedIn) {
    try {
      return await runCodexImage(prompt, outputPath, config);
    } catch {
      // fallback
    }
  }

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
    <rect width="1536" height="1024" fill="#0f172a"/>
    <circle cx="768" cy="512" r="300" fill="#6366f1" opacity=".2"/>
    <text x="768" y="520" fill="#f8fafc" font-family="sans-serif" font-size="36" text-anchor="middle">Antigravity / Gemini Image</text>
  </svg>`;
  await fs.writeFile(outputPath, svgContent, "utf8");
  return outputPath;
}

export async function runAntigravityStructured({ prompt, schema, config = {} }) {
  const cmd = config.antigravityPath || "gemini";
  const schemaStr = JSON.stringify(schema);
  const sysPrompt = `${prompt}\n\n【极其重要】：只返回符合以下 JSON Schema 的纯 JSON 对象，不要包含任何 markdown 格式化标记或解释性文字。\nJSON Schema: ${schemaStr}`;
  try {
    const { stdout } = await runCommand(cmd, ["-y", "-p", sysPrompt], {
      cwd: config.rootDir || process.cwd(),
      timeout: config.antigravityTimeoutMs || 5000,
    });
    const cleanJson = stdout.replace(/```json/gi, "").replace(/```/g, "").trim();
    const match = cleanJson.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(cleanJson);
  } catch {
    if (config.codexLoggedIn) {
      return await runCodexStructured({ prompt, schema, config, effort: "low" });
    }
    if (config.deepseekApiKey) {
      return await runDeepSeekStructured({ prompt, schema, config });
    }
    throw new Error("Gemini CLI 运行超时且未配置 Codex/DeepSeek 降级引擎");
  }
}
