import fs from "node:fs/promises";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { runCodexImage, runCodexStructured } from "./codex.js";
import { runDeepSeekStructured } from "./deepseek.js";

const TopicDecision = z.object({
  title: z.string(),
  angle: z.string(),
  whyNow: z.string(),
  readerPromise: z.string(),
  keywords: z.array(z.string()),
  researchSummary: z.string(),
  sources: z.array(
    z.object({
      title: z.string(),
      publisher: z.string(),
      url: z.string(),
    }),
  ),
});

export const ArticleDraft = z.object({
  title: z.string(),
  digest: z.string(),
  kicker: z.string(),
  lead: z.string(),
  sections: z.array(
    z.object({
      heading: z.string(),
      paragraphs: z.array(z.string()),
      callout: z.string(),
    }),
  ),
  conclusion: z.string(),
  imagePrompt: z.string(),
  sectionImages: z.array(z.string()),
});

const topicDecisionSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    angle: { type: "string" },
    whyNow: { type: "string" },
    readerPromise: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    researchSummary: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          publisher: { type: "string" },
          url: { type: "string" },
        },
        required: ["title", "publisher", "url"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "angle", "whyNow", "readerPromise", "keywords", "researchSummary", "sources"],
  additionalProperties: false,
};

export const articleDraftSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    digest: { type: "string" },
    kicker: { type: "string" },
    lead: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          paragraphs: { type: "array", items: { type: "string" } },
          callout: { type: "string" },
        },
        required: ["heading", "paragraphs", "callout"],
        additionalProperties: false,
      },
    },
    conclusion: { type: "string" },
    imagePrompt: { type: "string" },
    sectionImages: { type: "array", items: { type: "string" } },
  },
  required: [
    "title",
    "digest",
    "kicker",
    "lead",
    "sections",
    "conclusion",
    "imagePrompt",
    "sectionImages",
  ],
  additionalProperties: false,
};

function clientFor(apiKey) {
  return new OpenAI({ apiKey });
}

export async function chooseTopic(settings, config) {
  if (config.aiProvider === "codex") {
    const value = await runCodexStructured({
      config,
      effort: "low",
      search: true,
      schema: topicDecisionSchema,
      prompt: `你是一位严谨的微信公众号主编。联网检索最近 7 天与栏目定位真正相关的变化，选择唯一值得写、能给读者明确收益的选题。事实必须有可核查来源，不编造数据。\n\n公众号主题：${settings.theme}\n目标读者：${settings.audience}\n写作气质：${settings.tone}\n\n只返回符合 schema 的 JSON。`,
    });
    return TopicDecision.parse(value);
  }
  if (config.aiProvider === "deepseek") {
    const research = await runCodexStructured({
      config,
      effort: "low",
      search: true,
      schema: topicDecisionSchema,
      prompt: `你是微信公众号研究编辑。联网检索最近 7 天与栏目定位真正相关的变化，整理一个有可核查来源的候选选题，不编造数据。\n\n公众号主题：${settings.theme}\n目标读者：${settings.audience}\n写作气质：${settings.tone}\n\n只返回符合 schema 的 JSON。`,
    });
    const value = await runDeepSeekStructured({
      config,
      schema: topicDecisionSchema,
      prompt: `根据下面的联网研究结果，确定今天唯一值得写、能给读者明确收益的选题。来源标题、发布方和 URL 必须原样保留，不新增未经核查的事实。\n\n公众号主题：${settings.theme}\n目标读者：${settings.audience}\n写作气质：${settings.tone}\n联网研究：${JSON.stringify(research)}`,
    });
    return TopicDecision.parse(value);
  }
  const client = clientFor(config.openaiApiKey);
  const response = await client.responses.parse({
    model: config.textModel,
    reasoning: { effort: "low" },
    tools: [{ type: "web_search" }],
    input: [
      {
        role: "system",
        content:
          "你是一位严谨的微信公众号主编。用联网检索找到最近 7 天与栏目定位真正相关的变化，选择一个不追逐空泛热搜、能给读者明确收益的选题。事实必须有可核查来源，不编造数据。只返回指定结构。",
      },
      {
        role: "user",
        content: `公众号主题：${settings.theme}\n目标读者：${settings.audience}\n写作气质：${settings.tone}\n请选出今天唯一值得写的题，并给出研究摘要。`,
      },
    ],
    text: { format: zodTextFormat(TopicDecision, "topic_decision") },
  });
  return response.output_parsed;
}

export async function writeArticle(topic, settings, config, options = {}) {
  const refArticle = options.referenceArticle || settings.referenceArticle || "";
  const referencePrompt = refArticle
    ? `\n\n【风格范文仿写要求】：\n请深度分析并模仿以下参考范文的叙事套路、开篇 hook 钩子、小节推进逻辑、段落节奏与金句总结习惯，但保持新文章在选题上的独立论据与具体事实：\n---参考范文开始---\n${refArticle.slice(0, 3000)}\n---参考范文结束---\n`
    : "";
  const sectionHint =
    "另外，为每一个正文小节各写一条横向插图视觉提示词（画面中不要出现任何文字、字母、数字、Logo 或水印），以 sectionImages 字符串数组返回，数组长度必须与该文章的 sections 数量一致。";
  if (config.aiProvider === "codex") {
    const value = await runCodexStructured({
      config,
      effort: "medium",
      schema: articleDraftSchema,
      prompt: `你是成熟的中文专栏作者。文章要有明确论点、具体场景、可执行的方法和自然节奏；不用套话，不堆砌小标题，不虚构采访、案例或数据。标题不超过 28 个汉字，摘要不超过 90 个汉字。${referencePrompt}\n\n选题：${topic.title}\n切入角度：${topic.angle}\n为什么现在写：${topic.whyNow}\n读者收获：${topic.readerPromise}\n研究摘要：${topic.researchSummary}\n栏目主题：${settings.theme}\n读者：${settings.audience}\n语气：${settings.tone}\n目标长度：约 ${settings.targetLength} 字\n图片风格：${settings.imageStyle}\n\n完成可直接进入微信公众号编辑器的文章结构，并给出一条不含文字、Logo、水印的封面图视觉提示。${sectionHint}\n只返回符合 schema 的 JSON。`,
    });
    return ArticleDraft.parse(value);
  }
  if (config.aiProvider === "deepseek") {
    const value = await runDeepSeekStructured({
      config,
      schema: articleDraftSchema,
      prompt: `你是成熟的中文专栏作者。文章要有明确论点、具体场景、可执行的方法和自然节奏；不用套话，不堆砌小标题，不虚构采访、案例或数据。标题不超过 28 个汉字，摘要不超过 90 个汉字。${referencePrompt}\n\n选题：${topic.title}\n切入角度：${topic.angle}\n为什么现在写：${topic.whyNow}\n读者收获：${topic.readerPromise}\n研究摘要：${topic.researchSummary}\n栏目主题：${settings.theme}\n读者：${settings.audience}\n语气：${settings.tone}\n目标长度：约 ${settings.targetLength} 字\n图片风格：${settings.imageStyle}\n\n完成可直接进入微信公众号编辑器的文章结构，并给出一条不含文字、Logo、水印的封面图视觉提示。${sectionHint}`,
    });
    return ArticleDraft.parse(value);
  }
  const client = clientFor(config.openaiApiKey);
  const response = await client.responses.parse({
    model: config.textModel,
    reasoning: { effort: "medium" },
    input: [
      {
        role: "system",
        content:
          "你是成熟的中文专栏作者。文章要有明确论点、具体场景、可执行的方法和自然节奏；不用‘在当今时代’等套话，不堆砌小标题，不虚构采访、案例或数据。标题不超过 28 个汉字，摘要不超过 90 个汉字。只返回指定结构。",
      },
      {
        role: "user",
        content: `选题：${topic.title}\n切入角度：${topic.angle}\n为什么现在写：${topic.whyNow}\n读者收获：${topic.readerPromise}\n研究摘要：${topic.researchSummary}\n栏目主题：${settings.theme}\n读者：${settings.audience}\n语气：${settings.tone}\n目标长度：约 ${settings.targetLength} 字\n图片风格：${settings.imageStyle}${referencePrompt}\n\n请完成可直接进入微信公众号编辑器的文章结构，并给出一条不含任何文字、Logo、水印的封面图生成提示词。${sectionHint}`,
      },
    ],
    text: { format: zodTextFormat(ArticleDraft, "article_draft") },
  });
  return response.output_parsed;
}

export async function generateImage(prompt, outputPath, config) {
  if (config.imageProvider === "codex" || config.aiProvider === "codex") {
    return runCodexImage(prompt, outputPath, config);
  }
  const client = clientFor(config.openaiApiKey);
  const result = await client.images.generate({
    model: config.imageModel,
    prompt: `${prompt}\n横向编辑插画，主体清晰，四周保留安全留白；画面中不要出现文字、字母、数字、标志或水印。`,
    size: "1536x1024",
    quality: "medium",
    output_format: "png",
  });
  const base64 = result.data?.[0]?.b64_json;
  if (!base64) throw new Error("图片接口未返回图像数据");
  await fs.writeFile(outputPath, Buffer.from(base64, "base64"));
  return outputPath;
}

export async function generateCover(prompt, outputPath, config) {
  return generateImage(prompt, outputPath, config);
}

export function isAiReady(config) {
  const textReady =
    (config.aiProvider === "codex" && config.codexLoggedIn) ||
    (config.aiProvider === "deepseek" && config.deepseekApiKey) ||
    (config.aiProvider === "openai" && config.openaiApiKey);
  const imageReady =
    (config.imageProvider === "codex" && config.codexLoggedIn) ||
    (config.imageProvider === "openai" && config.openaiApiKey) ||
    (!config.imageProvider && textReady);
  return Boolean(textReady && imageReady);
}

export function demoTopic(settings) {
  return {
    title: "会用 AI 之后，为什么工作还是没有变轻松？",
    angle: "把注意力从‘工具数量’移到‘工作流设计’，拆解个人自动化真正产生复利的三个条件。",
    whyNow: "越来越多人已经拥有多个 AI 工具，却仍在重复复制、粘贴、校对和追进度。",
    readerPromise: "读完能画出自己的第一条可自动运行、但保留人工决策点的工作流。",
    keywords: ["AI 工作流", "个人效率", "自动化", settings.theme],
    researchSummary: "演示模式使用内置选题，不引用实时外部事实；接入 OpenAI 后会在选题阶段自动联网研究。",
    sources: [],
  };
}

export function demoArticle(topic, settings) {
  return {
    title: topic.title,
    digest: "真正省时间的不是多一个工具，而是让信息沿着固定路径流动，并把判断留给自己。",
    kicker: `${settings.theme} · 今日观察`,
    lead: "你可能已经把 AI 塞进了每一个工作环节，却依然每天在窗口之间来回搬运信息。问题不在工具不够强，而在于工作仍由一堆孤立动作组成。",
    sections: [
      {
        heading: "工具越多，为什么反而越忙",
        paragraphs: [
          "每次打开一个新工具，我们解决的往往只是眼前的一个动作：写一句话、总结一份材料、做一张图。但真正消耗注意力的，是动作之间的连接——找到材料、补充背景、确认格式、保存版本，再通知下一个人。",
          "如果这些连接仍靠记忆完成，工具只是把局部动作加速了。你会更快地产出，也会更快地堆积待确认、待整理和待发送的半成品。",
        ],
        callout: "不要先问‘哪个工具更强’，先问‘信息下一步应该自动流向哪里’。",
      },
      {
        heading: "一条有效工作流，只需要三个部件",
        paragraphs: [
          "第一是稳定的入口。邮件、表单、会议记录或一个固定文件夹，只选一个作为触发点。入口越多，遗漏和重复越多。",
          "第二是可以验证的中间产物。让 AI 输出结构化提纲、候选标题或待审核草稿，而不是直接追求最终成品。你需要一眼看出它做到了什么、还缺什么。",
          "第三是明确的人工决策点。涉及观点、承诺和对外发布的动作停在你面前，其余搬运、格式化和归档交给系统。自动化的目标不是移除人，而是把人放在最值钱的位置。",
        ],
        callout: "入口固定、产物可验、决策留人——这是个人自动化最小闭环。",
      },
      {
        heading: "今天就能画出的第一条流程",
        paragraphs: [
          "选一个每周至少重复两次的任务，用五个框写下：触发、收集、生成、审核、交付。先不选工具，只写每一步的输入和输出。",
          "随后圈出必须由你判断的那个框，其余步骤再去寻找自动化方法。这样搭出的系统不追求炫技，却会随着每次运行积累上下文、模板和反馈。省下来的不只是几分钟，而是反复重新进入任务的成本。",
        ],
        callout: "从一条高频、低风险、结果容易检查的流程开始。",
      },
    ],
    conclusion: "把 AI 当作工具，你会得到更快的动作；把它放进工作流，你才会得到更轻的工作。下一次想安装新工具前，先把信息流画出来。",
    imagePrompt: "俯视角的创意工作台，一条鲜明的珊瑚色纸带穿过分散的卡片、文件与工具，并将它们连接成清晰流线，冷灰蓝背景，现代编辑插画，克制、精确、有空间感",
    sectionImages: [
      "散落的便利贴与待办卡片堆在桌面，箭头试图连接却断裂，灰调办公场景，克制编辑插画",
      "三块拼图：入口漏斗、清单草稿、带红点的决策框，被一条纸带串起，清爽留白，现代插画",
      "五只编号圆点连成闭环，其中一只被高亮描边，其余淡灰，极简示意风，米白背景",
    ],
  };
}
