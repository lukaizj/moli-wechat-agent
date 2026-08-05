import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { buildWechatHtml, plainTextLength } from "./article.js";
import { chooseTopic, demoArticle, demoTopic, generateCover, writeArticle } from "./ai.js";
import { addDraft, getStableAccessToken, uploadArticleImage, uploadPermanentCover } from "./wechat.js";

const steps = [
  ["research", "联网研究与选题"],
  ["writing", "撰写与结构化排版"],
  ["image", "生成封面与正文配图"],
  ["wechat", "写入公众号草稿箱"],
];

function makeRun(trigger) {
  return {
    id: randomUUID(),
    trigger,
    status: "queued",
    mode: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    articleId: null,
    error: null,
    steps: steps.map(([key, label]) => ({ key, label, status: "queued", detail: "" })),
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

export class Pipeline {
  constructor({ store, config, generatedDir }) {
    this.store = store;
    this.config = config;
    this.generatedDir = generatedDir;
    this.activeRunId = null;
  }

  async start(trigger = "manual") {
    if (this.activeRunId) {
      const error = new Error("已有一篇文章正在生成，请稍后查看进度");
      error.code = "RUN_ACTIVE";
      throw error;
    }
    const run = makeRun(trigger);
    this.activeRunId = run.id;
    await this.store.update((state) => {
      state.runs.unshift(run);
      state.runs = state.runs.slice(0, 30);
    });
    void this.execute(run.id).finally(() => {
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
    await this.store.update((state) => {
      const run = state.runs.find((item) => item.id === runId);
      const step = run?.steps.find((item) => item.key === key);
      if (step) Object.assign(step, { status, detail });
    });
  }

  async execute(runId) {
    const settings = this.store.snapshot().settings;
    const aiReady = Boolean(this.config.openaiApiKey);
    const wechatReady = Boolean(this.config.wechatAppId && this.config.wechatAppSecret);
    const mode = aiReady ? "live" : "demo";

    try {
      await fs.mkdir(this.generatedDir, { recursive: true });
      await this.updateRun(runId, { status: "running", mode });

      await this.updateStep(runId, "research", "running", aiReady ? "检索最近 7 天信号" : "使用内置演示选题");
      const topic = aiReady ? await chooseTopic(settings, this.config) : demoTopic(settings);
      await this.updateStep(runId, "research", "done", topic.title);

      await this.updateStep(runId, "writing", "running", `目标约 ${settings.targetLength} 字`);
      const draft = aiReady ? await writeArticle(topic, settings, this.config) : demoArticle(topic, settings);
      await this.updateStep(runId, "writing", "done", draft.title);

      await this.updateStep(runId, "image", "running", aiReady ? this.config.imageModel : "生成演示封面");
      const extension = aiReady ? "png" : "svg";
      const coverFile = `${runId}.${extension}`;
      const coverPath = path.join(this.generatedDir, coverFile);
      if (aiReady) await generateCover(draft.imagePrompt, coverPath, this.config);
      else await fs.writeFile(coverPath, demoCoverSvg(draft.title), "utf8");
      await this.updateStep(runId, "image", "done", coverFile);

      let html = buildWechatHtml(draft, topic);
      let wechatMediaId = null;
      let status = "local_preview";

      if (aiReady && wechatReady) {
        await this.updateStep(runId, "wechat", "running", "上传图片与封面素材");
        const accessToken = await getStableAccessToken(this.config);
        const bodyImageUrl = await uploadArticleImage(accessToken, coverPath);
        const thumbMediaId = await uploadPermanentCover(accessToken, coverPath);
        html = buildWechatHtml(draft, topic, bodyImageUrl);
        wechatMediaId = await addDraft(
          accessToken,
          { ...draft, html, thumbMediaId },
          settings,
        );
        status = "wechat_draft";
        await this.updateStep(runId, "wechat", "done", `草稿 media_id：${wechatMediaId}`);
      } else {
        const missing = [!aiReady && "OpenAI", !wechatReady && "微信公众号"].filter(Boolean).join("、");
        await this.updateStep(runId, "wechat", "skipped", `${missing}密钥未配置，已保存到本地预览`);
      }

      const article = {
        id: randomUUID(),
        runId,
        status,
        title: draft.title,
        digest: draft.digest,
        topic,
        html,
        plainTextLength: plainTextLength(html),
        coverUrl: `/generated/${coverFile}`,
        coverPath,
        wechatMediaId,
        createdAt: new Date().toISOString(),
      };
      await this.store.update((state) => {
        state.articles.unshift(article);
        state.articles = state.articles.slice(0, 100);
        const run = state.runs.find((item) => item.id === runId);
        Object.assign(run, {
          status: "completed",
          completedAt: new Date().toISOString(),
          articleId: article.id,
        });
      });
      return article;
    } catch (error) {
      await this.updateRun(runId, {
        status: "failed",
        completedAt: new Date().toISOString(),
        error: error.message,
      });
      const state = this.store.snapshot();
      const run = state.runs.find((item) => item.id === runId);
      const runningStep = run?.steps.find((item) => item.status === "running");
      if (runningStep) await this.updateStep(runId, runningStep.key, "failed", error.message);
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
      throw new Error("演示封面是 SVG；请配置 OpenAI 后重新生成 PNG 正式稿");
    }
    const accessToken = await getStableAccessToken(this.config);
    const bodyImageUrl = await uploadArticleImage(accessToken, article.coverPath);
    const thumbMediaId = await uploadPermanentCover(accessToken, article.coverPath);
    const html = article.html.replaceAll("{{BODY_IMAGE_URL}}", bodyImageUrl);
    const mediaId = await addDraft(
      accessToken,
      { ...article, html, thumbMediaId },
      state.settings,
    );
    await this.store.update((next) => {
      const saved = next.articles.find((item) => item.id === articleId);
      Object.assign(saved, { status: "wechat_draft", html, wechatMediaId: mediaId });
    });
    return { mediaId };
  }
}
