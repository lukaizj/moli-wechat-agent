import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { ArticleDraft, articleDraftSchema } from "./ai.js";
import { runCodexStructured } from "./codex.js";
import { runDeepSeekStructured } from "./deepseek.js";

const Score = z.object({
  directness: z.number().int().min(1).max(10),
  rhythm: z.number().int().min(1).max(10),
  trust: z.number().int().min(1).max(10),
  authenticity: z.number().int().min(1).max(10),
  concision: z.number().int().min(1).max(10),
  total: z.number().int().min(5).max(50),
  summary: z.string(),
});

const HumanizerResult = z.object({ draft: ArticleDraft, score: Score });

const scoreSchema = {
  type: "object",
  properties: {
    directness: { type: "integer", minimum: 1, maximum: 10 },
    rhythm: { type: "integer", minimum: 1, maximum: 10 },
    trust: { type: "integer", minimum: 1, maximum: 10 },
    authenticity: { type: "integer", minimum: 1, maximum: 10 },
    concision: { type: "integer", minimum: 1, maximum: 10 },
    total: { type: "integer", minimum: 5, maximum: 50 },
    summary: { type: "string" },
  },
  required: ["directness", "rhythm", "trust", "authenticity", "concision", "total", "summary"],
  additionalProperties: false,
};

const humanizerResultSchema = {
  type: "object",
  properties: { draft: articleDraftSchema, score: scoreSchema },
  required: ["draft", "score"],
  additionalProperties: false,
};

async function runWithSelectedProvider(prompt, config) {
  if (config.aiProvider === "deepseek") {
    return runDeepSeekStructured({ prompt, schema: humanizerResultSchema, config });
  }
  if (config.aiProvider === "codex") {
    return runCodexStructured({ prompt, schema: humanizerResultSchema, config, effort: "medium" });
  }
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const response = await client.responses.parse({
    model: config.textModel,
    reasoning: { effort: "medium" },
    input: prompt,
    text: { format: zodTextFormat(HumanizerResult, "humanizer_result") },
  });
  return response.output_parsed;
}

export async function humanizeArticle(draft, topic, settings, config) {
  const rulesPath = path.join(config.rootDir, "vendor", "Humanizer-zh", "SKILL.md");
  const rules = await fs.readFile(rulesPath, "utf8");
  const prompt = `请按 Humanizer-zh 规则编辑下面的公众号文章。保留原有事实、来源边界、核心判断和字段结构；不要新增人物、数据、经历或第一人称见闻。允许调整标题、摘要、句子节奏、段落表达和小标题。最终按五个维度评分，总分必须等于五项之和。\n\n<公众号设定>\n语气：${settings.tone}\n目标读者：${settings.audience}\n</公众号设定>\n\n<选题事实边界>\n${JSON.stringify(topic)}\n</选题事实边界>\n\n<待编辑草稿>\n${JSON.stringify(draft)}\n</待编辑草稿>\n\n<Humanizer-zh规则>\n${rules}\n</Humanizer-zh规则>`;
  const result = HumanizerResult.parse(await runWithSelectedProvider(prompt, config));
  const calculated =
    result.score.directness +
    result.score.rhythm +
    result.score.trust +
    result.score.authenticity +
    result.score.concision;
  return { draft: result.draft, score: { ...result.score, total: calculated } };
}
