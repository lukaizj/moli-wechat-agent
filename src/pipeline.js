import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { buildWechatHtml, designThemes, plainTextLength, selectDesignTheme } from "./article.js";
import { chooseTopic, demoArticle, demoTopic, generateCover, generateImage, isAiReady, writeArticle } from "./ai.js";
import { validateGzhHtml } from "./gzh.js";
import { humanizeArticle } from "./humanizer.js";
import { addDraft, getStableAccessToken, uploadArticleImage, uploadPermanentCover } from "./wechat.js";
import { logger } from "./logger.js";

const steps = [
  ["research", "联网研究与选题"],
  ["writing", "撰写与结构化排版"],
  ["humanize", "Humanizer 去除 AI 味"],
  ["image", "生成封面与配图"],
  ["design", "公众号主题排版与校验"],
  ["wechat", "写入公众号草稿箱"],
];

function makeRun(trigger) {
  return {
    id: randomUUID(),
    trigger,
    status: "queued",
    mode: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    durationMs: null,
    articleId: null,
    error: null,
    steps: steps.map(([key, label]) => ({
      key,
      label,
      status: "queued",
      detail: "",
      startedAt: null,
      completedAt: null,
      durationMs: null,
    })),
  };
}

function demoCoverSvg(title) {
  const safeTitle = title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
    <rect width="1536" height="1024" fill="#dfe5f2"/>
    <path d="M-40 710 C280 460 390 830 690 580 S1130 230 1600 410" fill="none" stroke="#ff5a49" stroke-width="92" stroke-linecap="round"/>
    <g fill="#11182a">
      <rect x="165" y="180" width="260" height="170" rx="12" opacity=".95"/>
      <rect x="1020" y="630" width="310" height="190" rx="12" opacity=".95"/>
      <circle cx="760" cy="350" r="112" opacity=".14"/>
    </g>
    <g fill="#fff" opacity=".92"><circle cx="245" cy="242" r="18"/><circle cx="300" cy="242" r="18"/><rect x="225" y="285" width="140" height="14" rx="7"/></g>
    <text x="110" y="930" fill="#596176" font-family="sans-serif" font-size="26">DEMO COVER · ${safeTitle.slice(0, 22)}</text>
  </svg>`;
}

function demoSectionSvg(heading, index) {
  const safe = String(heading || "插图").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const hues = ["#059669", "#DC2626", "#52525B", "#4A5D52", "#ED7B2F"];
  const color = hues[index % hues.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="900" viewBox="0 0 1536 900">
    <rect width="1536" height="900" fill="#eef1f7"/>
    <rect x="120" y="120" width="1296" height="660" rx="18" fill="#fff" stroke="${color}" stroke-width="6"/>
    <circle cx="768" cy="400" r="150" fill="${color}" opacity=".12"/>
    <text x="768" y="470" fill="${color}" font-family="sans-serif" font-size="40" text-anchor="middle">DEMO · ${safe.slice(0, 16)}</text>
    <text x="768" y="540" fill="#9aa3b2" font-family="sans-serif" font-size="22" text-anchor="middle">小节插图占位</text>
  </svg>`;
}

export class Pipeline {
  constructor({ store, config, generatedDir }) {
    this.store = store;
    this.config = config;
    this.generatedDir = generatedDir;
    this.activeRunId = null;
  }

  async start(trigger = "manual", options = {}) {
    if (this.activeRunId) {
      const error = new Error("已有一篇文章正在生成，请稍后查看进度");
      error.code = "RUN_ACTIVE";
      throw error;
    }
    const run = makeRun(trigger);
    if (options.referenceArticle) run.referenceArticle = options.referenceArticle;
    if (options.customTopic) run.customTopic = options.customTopic;
    this.activeRunId = run.id;
    await this.store.update((state) => {
      state.runs.unshift(run);
      state.runs = state.runs.slice(0, 30);
    });
    void this.execute(run.id, options).finally(() => {
      this.activeRunId = null;
    });
    return run;
  }

  async updateRun(runId, update) {
    await this.store.update((state) => {
      const run = state.runs.find((item) => item.id === runId);
      if (!run) return;
      Object.assign(run, update);
    });
  }

  async updateStep(runId, key, status, detail = "") {
    const now = new Date().toISOString();
    await this.store.update((state) => {
      const run = state.runs.find((item) => item.id === runId);
      const step = run?.steps.find((item) => item.key === key);
      if (!step) return;
      if (status === "running" && !step.startedAt) step.startedAt = now;
      if (["done", "failed", "skipped"].includes(status)) {
        step.completedAt = now;
        if (step.startedAt) step.durationMs = Date.parse(now) - Date.parse(step.startedAt);
      }
      Object.assign(step, { status, detail });
    });
  }

  async execute(runId, options = {}) {
    const settings = this.store.snapshot().settings;
    const refArticle = options.referenceArticle || settings.referenceArticle || "";
    const aiReady = isAiReady(this.config);
    const wechatReady = Boolean(this.config.wechatAppId && this.config.wechatAppSecret);
    const mode = aiReady ? "live" : "demo";
    const runStartedAt = new Date().toISOString();
    logger.info("pipeline", `run ${runId} 开始`, { mode, wechatReady, hasReference: Boolean(refArticle) });

    try {
      await fs.mkdir(this.generatedDir, { recursive: true });
      await this.updateRun(runId, {
        status: "running",
        mode: aiReady ? this.config.aiProvider || "openai" : mode,
        startedAt: runStartedAt,
      });

      let topic;
      if (options.customTopic) {
        await this.updateStep(runId, "research", "done", `指定选题：${options.customTopic}`);
        topic = {
          title: options.customTopic,
          angle: refArticle ? "根据参考范文的框架与文风展开写作" : "针对用户指定主题展开深度讨论",
          whyNow: "用户指定主题切入",
          readerPromise: "获得针对指定主题的系统性见解与可执行结论",
          keywords: [options.customTopic, settings.theme],
          researchSummary: "用户手动指定的特别主题。",
          sources: [],
        };
      } else {
        await this.updateStep(runId, "research", "running", aiReady ? "检索最近 7 天信号" : "使用内置演示选题");
        topic = aiReady ? await chooseTopic(settings, this.config) : demoTopic(settings);
        await this.updateStep(runId, "research", "done", topic.title);
      }
      logger.info("pipeline", `选题完成：${topic.title}`, { runId });

      const writingDetail = refArticle
        ? `目标约 ${settings.targetLength} 字 · 范文模仿模式`
        : `目标约 ${settings.targetLength} 字`;
      await this.updateStep(runId, "writing", "running", writingDetail);
      let draft = aiReady
        ? await writeArticle(topic, settings, this.config, { referenceArticle: refArticle })
        : demoArticle(topic, settings);
      await this.updateStep(runId, "writing", "done", draft.title);

      let humanizer = null;
      if (aiReady && settings.humanizeEnabled !== false) {
        await this.updateStep(runId, "humanize", "running", "按 Humanizer-zh 规则二次编辑");
        const result = await humanizeArticle(draft, topic, settings, this.config);
        draft = result.draft;
        humanizer = result.score;
        await this.updateStep(runId, "humanize", "done", `自然度评分 ${humanizer.total}/50`);
      } else {
        await this.updateStep(runId, "humanize", "skipped", aiReady ? "已在设定中关闭" : "演示模式跳过模型复核");
      }

      const imageEngine = this.config.imageProvider === "codex" ? "ChatGPT 会员配图" : this.config.imageModel;
      await this.updateStep(runId, "image", "running", aiReady ? imageEngine : "生成演示封面与插图");
      const extension = aiReady ? "png" : "svg";
      const coverFile = `${runId}.${extension}`;
      const coverPath = path.join(this.generatedDir, coverFile);
      if (aiReady) await generateCover(draft.imagePrompt, coverPath, this.config);
      else await fs.writeFile(coverPath, demoCoverSvg(draft.title), "utf8");

      const sectionPlaceholders = draft.sections.map((_, index) => `{{SECTION_IMAGE_${index}}}`);
      const sectionFiles = [];
      const sectionPaths = [];
      for (let index = 0; index < draft.sections.length; index += 1) {
        const file = `${runId}-s${index}.${extension}`;
        const filePath = path.join(this.generatedDir, file);
        const prompt = draft.sectionImages?.[index] || draft.imagePrompt;
        if (aiReady) await generateImage(prompt, filePath, this.config);
        else await fs.writeFile(filePath, demoSectionSvg(draft.sections[index]?.heading, index), "utf8");
        sectionFiles.push(file);
        sectionPaths.push(filePath);
      }
      await this.updateStep(
        runId,
        "image",
        "done",
        `${coverFile} + ${sectionPaths.length} 张小节插图`,
      );

      const designTheme = selectDesignTheme(draft, topic, settings.designTheme);
      await this.updateStep(runId, "design", "running", `应用${designThemes[designTheme].name}`);
      const html = buildWechatHtml(draft, topic, "{{BODY_IMAGE_URL}}", {
        designTheme,
        author: settings.author,
        sectionUrls: sectionPlaceholders,
      });
      const previewHtml = html
        .replaceAll("{{BODY_IMAGE_URL}}", `/generated/${coverFile}`)
        .replaceAll(/\{\{SECTION_IMAGE_(\d+)\}\}/g, (_, index) => `/generated/${sectionFiles[Number(index)]}`);
      const gzhValidation = await validateGzhHtml(html, this.config.rootDir);
      await this.updateStep(
        runId,
        "design",
        "done",
        `${designThemes[designTheme].name} · ${gzhValidation.leafCount} 处文字兼容标记`,
      );

      let finalHtml = html;
      let finalValidation = gzhValidation;
      let wechatMediaId = null;
      let status = "local_preview";

      if (aiReady && wechatReady) {
        await this.updateStep(runId, "wechat", "running", "上传图片与封面素材");
        const accessToken = await getStableAccessToken(this.config);
        const heroUrl = await uploadArticleImage(accessToken, coverPath);
        const sectionUrls = [];
        for (const filePath of sectionPaths) {
          sectionUrls.push(await uploadArticleImage(accessToken, filePath));
        }
        finalHtml = buildWechatHtml(draft, topic, heroUrl, {
          designTheme,
          author: settings.author,
          sectionUrls,
        });
        finalValidation = await validateGzhHtml(finalHtml, this.config.rootDir);
        wechatMediaId = await addDraft(
          accessToken,
          { ...draft, html: finalHtml, thumbMediaId: await uploadPermanentCover(accessToken, coverPath) },
          settings,
        );
        status = "wechat_draft";
        await this.updateStep(runId, "wechat", "done", `草稿 media_id：${wechatMediaId}`);
      } else {
        const missing = [!aiReady && "内容引擎", !wechatReady && "微信公众号"].filter(Boolean).join("、");
        await this.updateStep(runId, "wechat", "skipped", `${missing}尚未接入，已保存到本地预览`);
      }

      const article = {
        id: randomUUID(),
        runId,
        status,
        title: draft.title,
        digest: draft.digest,
        topic,
        humanizer,
        designTheme,
        designThemeName: designThemes[designTheme].name,
        gzhLeafCount: finalValidation.leafCount,
        html: finalHtml,
        previewHtml: status === "wechat_draft" ? finalHtml : previewHtml,
        plainTextLength: plainTextLength(finalHtml),
        coverUrl: `/generated/${coverFile}`,
        coverPath,
        sectionImagePaths: sectionPaths,
        sectionImageCount: sectionPaths.length,
        sectionImageFiles: sectionFiles,
        wechatMediaId,
        createdAt: new Date().toISOString(),
        edited: false,
        isImitation: Boolean(refArticle),
      };
      const completedAt = new Date().toISOString();
      const durationMs = Date.parse(completedAt) - Date.parse(runStartedAt);
      await this.store.update((state) => {
        state.articles.unshift(article);
        state.articles = state.articles.slice(0, 100);
        const run = state.runs.find((item) => item.id === runId);
        Object.assign(run, {
          status: "completed",
          completedAt,
          durationMs,
          articleId: article.id,
        });
      });
      logger.info("pipeline", `run ${runId} 完成`, {
        status,
        durationMs,
        leafCount: finalValidation.leafCount,
        wechatMediaId,
      });
      return article;
    } catch (error) {
      const completedAt = new Date().toISOString();
      const durationMs = Date.parse(completedAt) - Date.parse(runStartedAt);
      await this.updateRun(runId, {
        status: "failed",
        completedAt,
        durationMs,
        error: error.message,
      });
      const state = this.store.snapshot();
      const run = state.runs.find((item) => item.id === runId);
      const runningStep = run?.steps.find((item) => item.status === "running");
      if (runningStep) await this.updateStep(runId, runningStep.key, "failed", error.message);
      logger.error("pipeline", `run ${runId} 失败`, { step: runningStep?.key, error: error.message });
      return null;
    }
  }

  async pushExisting(articleId) {
    if (!this.config.wechatAppId || !this.config.wechatAppSecret) {
      throw new Error("请先在 .env 配置 WECHAT_APP_ID 与 WECHAT_APP_SECRET");
    }
    const state = this.store.snapshot();
    const article = state.articles.find((item) => item.id === articleId);
    if (!article) throw new Error("未找到这篇文章");
    if (article.coverPath.endsWith(".svg")) {
      throw new Error("演示封面是 SVG；请接入内容引擎后重新生成 PNG 正式稿");
    }
    const accessToken = await getStableAccessToken(this.config);
    const heroUrl = await uploadArticleImage(accessToken, article.coverPath);
    let html = article.html.replaceAll("{{BODY_IMAGE_URL}}", heroUrl);
    const sectionPaths = article.sectionImagePaths || [];
    for (let index = 0; index < sectionPaths.length; index += 1) {
      const url = await uploadArticleImage(accessToken, sectionPaths[index]);
      html = html.replaceAll(`{{SECTION_IMAGE_${index}}}`, url);
    }
    const thumbMediaId = await uploadPermanentCover(accessToken, article.coverPath);
    await validateGzhHtml(html, this.config.rootDir);
    const mediaId = await addDraft(
      accessToken,
      { ...article, html, thumbMediaId },
      state.settings,
    );
    await this.store.update((next) => {
      const saved = next.articles.find((item) => item.id === articleId);
      Object.assign(saved, { status: "wechat_draft", html, previewHtml: html, wechatMediaId: mediaId });
    });
    logger.info("pipeline", `文章 ${articleId} 已写入公众号草稿箱`, { mediaId });
    return { mediaId };
  }
}
