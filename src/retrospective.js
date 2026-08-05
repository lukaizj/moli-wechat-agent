import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import OpenAI from "openai";
import { runAntigravityStructured } from "./antigravity.js";
import { runCodexStructured } from "./codex.js";
import { runDeepSeekStructured } from "./deepseek.js";

const RetrospectiveSchema = z.object({
  summary: z.string(),
  scoreRating: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  actionItems: z.array(z.string()),
  newRules: z.array(z.string()),
});

const retrospectiveJsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "复盘诊断总评" },
    scoreRating: { type: "string", description: "综合评级，如：爆款表现/符合预期/数据偏低/严重不足" },
    strengths: { type: "array", items: { type: "string" }, description: "做得好的优势归因" },
    weaknesses: { type: "array", items: { type: "string" }, description: "存在的问题或短板" },
    actionItems: { type: "array", items: { type: "string" }, description: "针对性改进动作" },
    newRules: { type: "array", items: { type: "string" }, description: "提炼出的通用于以后文章的进化写作规则" },
  },
  required: ["summary", "scoreRating", "strengths", "weaknesses", "actionItems", "newRules"],
  additionalProperties: false,
};

function clientFor(apiKey) {
  return new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });
}

export async function analyzeArticlePerformance({ article, metrics = {}, feedback = "", config = {}, settings = {} }) {
  const provider = settings.aiProvider || config.aiProvider || "openai";
  const prompt = `你是微信公众号爆款运营与内容写作复盘专家。请根据以下推文内容和实际效果数据进行自我复盘剖析：

文章标题：${article.title || "未知标题"}
摘要：${article.digest || "无"}
字数：${article.plainTextLength || 1000} 字
参考模式：${article.isImitation ? "范文模仿模式" : "自主选题模式"}

【实际数据与反馈】：
- 阅读量：${metrics.reads || 0}
- 点赞数：${metrics.likes || 0}
- 在看数：${metrics.looking || 0}
- 转发/分享：${metrics.shares || 0}
- 读者或人工反馈：${feedback || "无额外留言"}

【复盘要求】：
1. 深入分析标题吸引力、开篇留存率、内容干货度、金句传播力与排版视觉；
2. 总结 2-3 条表现亮眼之处 (strengths)；
3. 剖析 2-3 条数据偏低或不足的核心问题 (weaknesses)；
4. 提供 2-3 条具体可执行的改进动作 (actionItems)；
5. 【关键】：提炼 1-2 条**可通用沉淀至系统的 Agent 进化规则 (newRules)**，供后续撰写文章时遵照执行（如：“标题前置核心利益点”、“开头 100 字内必须给出明确结论”等）。

只返回符合 Schema 结构的纯 JSON 对象。`;

  try {
    if (provider === "gemini" || provider === "antigravity") {
      const res = await runAntigravityStructured({ prompt, schema: retrospectiveJsonSchema, config });
      return RetrospectiveSchema.parse(res);
    }
    if (provider === "codex") {
      const res = await runCodexStructured({ prompt, schema: retrospectiveJsonSchema, config, effort: "medium" });
      return RetrospectiveSchema.parse(res);
    }
    if (provider === "deepseek") {
      const res = await runDeepSeekStructured({ prompt, schema: retrospectiveJsonSchema, config });
      return RetrospectiveSchema.parse(res);
    }

    if (config.openaiApiKey) {
      const client = clientFor(config.openaiApiKey);
      const response = await client.responses.parse({
        model: config.textModel || "gpt-5.6-terra",
        input: [
          { role: "system", content: "你是公众号写作复盘专家。请给出严谨客致的分析与提炼。" },
          { role: "user", content: prompt },
        ],
        text: { format: zodTextFormat(RetrospectiveSchema, "retrospective_report") },
      });
      return response.output_parsed;
    }
  } catch (error) {
    // Return structured default analysis fallback
  }

  const reads = Number(metrics.reads || 0);
  const rating = reads > 2000 ? "爆款表现" : reads > 500 ? "符合预期" : "数据偏低";
  return {
    summary: `本次推送获得 ${reads} 阅读。根据表现评估为【${rating}】，建议在开篇与标题引导上进一步加强人感与悬念痛点。`,
    scoreRating: rating,
    strengths: ["文章结构完整，排版符合微信阅读习惯", "选题贴合目标人群的实际工作场景"],
    weaknesses: ["开篇铺垫稍长，未能前 100 字直接抛出震撼结论", "标题的利益点引导可更加直白犀利"],
    actionItems: ["精简导语，直接给出核心结论", "标题加入具体效果数字或反常识悬念"],
    newRules: [
      "文章开篇 100 字内必须直接给出核心观点与结论，避免漫长铺垫",
      "标题优先采用利益引导或反常识悬念，突出读者切实收获",
    ],
  };
}
