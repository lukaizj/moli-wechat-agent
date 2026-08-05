import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { StateStore } from "./storage.js";
import { Pipeline } from "./pipeline.js";
import { isAiReady } from "./ai.js";
import { plainTextLength } from "./article.js";
import { checkCodexLogin } from "./codex.js";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");

const config = {
  rootDir,
  port: Number(process.env.PORT || 3210),
  host: process.env.HOST || "127.0.0.1",
  baseUrl: process.env.APP_BASE_URL || "http://localhost:3210",
  aiProvider: process.env.AI_PROVIDER || "openai",
  imageProvider: process.env.IMAGE_PROVIDER || (process.env.AI_PROVIDER === "deepseek" ? "codex" : process.env.AI_PROVIDER || "openai"),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  textModel: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-terra",
  imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
  codexPath: process.env.CODEX_PATH || "codex",
  codexModel: process.env.CODEX_MODEL || "gpt-5.4",
  codexTimeoutMs: Number(process.env.CODEX_TIMEOUT_MS || 600_000),
  codexLoggedIn: false,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
  deepseekMaxTokens: Number(process.env.DEEPSEEK_MAX_TOKENS || 8192),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  wechatAppId: process.env.WECHAT_APP_ID || "",
  wechatAppSecret: process.env.WECHAT_APP_SECRET || "",
};
if (config.aiProvider === "codex" || config.imageProvider === "codex") {
  config.codexLoggedIn = await checkCodexLogin(config);
}

const store = new StateStore(path.join(dataDir, "state.json"));
await store.init();
const initialSettings = store.snapshot().settings || {};
if (initialSettings.aiProvider) config.aiProvider = initialSettings.aiProvider;
if (initialSettings.imageProvider) config.imageProvider = initialSettings.imageProvider;

const pipeline = new Pipeline({ store, config, generatedDir: path.join(dataDir, "generated") });
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use("/generated", express.static(path.join(dataDir, "generated")));
app.use(express.static(path.join(rootDir, "public")));

function integrationStatus() {
  const settings = store.snapshot()?.settings || {};
  const mergedConfig = {
    ...config,
    aiProvider: settings.aiProvider || config.aiProvider,
    imageProvider: settings.imageProvider || config.imageProvider,
  };
  const ai = isAiReady(mergedConfig);
  return {
    ai,
    openai: mergedConfig.aiProvider === "openai" && Boolean(config.openaiApiKey),
    deepseek: mergedConfig.aiProvider === "deepseek" && Boolean(config.deepseekApiKey),
    aiProvider: mergedConfig.aiProvider,
    imageProvider: mergedConfig.imageProvider,
    chatgpt: (mergedConfig.aiProvider === "codex" || mergedConfig.imageProvider === "codex") && config.codexLoggedIn,
    wechat: Boolean(config.wechatAppId && config.wechatAppSecret),
    textModel:
      mergedConfig.aiProvider === "codex"
        ? config.codexModel
        : mergedConfig.aiProvider === "deepseek"
          ? config.deepseekModel
          : mergedConfig.aiProvider === "gemini"
            ? "Gemini CLI"
            : config.textModel,
    imageModel:
      mergedConfig.imageProvider === "codex"
        ? "ChatGPT imagegen"
        : mergedConfig.imageProvider === "gemini"
          ? "Gemini 生图"
          : config.imageModel,
  };
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, integrations: integrationStatus(), activeRunId: pipeline.activeRunId });
});

app.get("/api/state", (_request, response) => {
  response.json({ ...store.snapshot(), integrations: integrationStatus(), activeRunId: pipeline.activeRunId });
});

app.get("/source", (_request, response) => {
  response.type("text/plain").send(
    [
      `墨流对应源代码位于：${rootDir}`,
      "",
      "gzh-design-skill（AGPL-3.0-or-later）：",
      "https://github.com/isjiamu/gzh-design-skill",
      `${rootDir}/vendor/gzh-design-skill`,
      "",
      "Humanizer-zh（MIT）：",
      "https://github.com/op7418/Humanizer-zh",
      `${rootDir}/vendor/Humanizer-zh`,
      "",
      "第三方版本与许可证：",
      `${rootDir}/vendor/VENDORED.md`,
      `${rootDir}/THIRD_PARTY_NOTICES.md`,
    ].join("\n"),
  );
});

const allowedSettings = new Set([
  "accountName",
  "theme",
  "audience",
  "tone",
  "author",
  "targetLength",
  "referenceArticle",
  "humanizeEnabled",
  "designTheme",
  "aiProvider",
  "imageProvider",
  "imageStyle",
  "scheduleEnabled",
  "scheduleTime",
  "timezone",
  "allowComments",
  "fansOnlyComments",
  "activeColumnId",
]);
const allowedDesignThemes = new Set([
  "auto",
  "moyu-green",
  "red-white",
  "graphite-minimal",
  "zen-whitespace",
  "moyu-ticket",
  "olive-journal",
]);

app.put("/api/settings", async (request, response, next) => {
  try {
    const patch = Object.fromEntries(
      Object.entries(request.body || {}).filter(([key]) => allowedSettings.has(key)),
    );
    if (!patch.theme?.trim()) throw new Error("公众号主题不能为空");
    if (patch.scheduleTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.scheduleTime)) {
      throw new Error("定时时间应为 HH:MM");
    }
    if (patch.targetLength) patch.targetLength = Math.min(5000, Math.max(600, Number(patch.targetLength)));
    if (patch.humanizeEnabled !== undefined) patch.humanizeEnabled = Boolean(patch.humanizeEnabled);
    if (patch.designTheme && !allowedDesignThemes.has(patch.designTheme)) throw new Error("未知的公众号排版主题");

    if (patch.aiProvider) config.aiProvider = patch.aiProvider;
    if (patch.imageProvider) config.imageProvider = patch.imageProvider;

    await store.update((state) => {
      Object.assign(state.settings, patch);
      const activeId = state.settings.activeColumnId || "default";
      const activeCol = (state.settings.columns || []).find((col) => col.id === activeId);
      if (activeCol) {
        Object.assign(activeCol, patch);
      }
    });
    response.json({ ok: true, settings: store.snapshot().settings });
  } catch (error) {
    next(error);
  }
});

app.post("/api/upload-images", async (request, response, next) => {
  try {
    const { images } = request.body || {};
    if (!Array.isArray(images) || !images.length) {
      throw new Error("请提供需要上传的图片数据");
    }
    const uploadDir = path.join(dataDir, "generated", "user-uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    const saved = [];
    for (let i = 0; i < images.length; i += 1) {
      const item = images[i];
      const base64Data = typeof item === "string" ? item : item.data || "";
      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
      const name = typeof item === "object" && item ? item.name || "" : "";
      const extMatch = name.match(/\.(png|jpg|jpeg|gif|webp)$/i);
      const ext = extMatch ? extMatch[0].toLowerCase() : ".png";
      const filename = `${Date.now()}-${i}${ext}`;
      const filePath = path.join(uploadDir, filename);
      await fs.writeFile(filePath, Buffer.from(cleanBase64, "base64"));
      saved.push({
        filename,
        url: `/generated/user-uploads/${filename}`,
        path: filePath,
      });
    }
    response.json({ ok: true, files: saved });
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs/cancel", async (request, response, next) => {
  try {
    const { runId } = request.body || {};
    const success = await pipeline.cancel(runId);
    response.json({ ok: true, cancelled: success });
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs/restart", async (request, response, next) => {
  try {
    if (pipeline.activeRunId) {
      await pipeline.cancel(pipeline.activeRunId);
    }
    const { columnId, referenceArticle, customTopic, userImages, trigger } = request.body || {};
    const run = await pipeline.start(trigger || "restart", { referenceArticle, customTopic, userImages });
    response.status(202).json({ ok: true, run });
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs", async (request, response, next) => {
  try {
    const { columnId, referenceArticle, customTopic, userImages, trigger } = request.body || {};
    if (columnId) {
      await store.update((state) => {
        const target = state.settings.columns?.find((col) => col.id === columnId);
        if (target) {
          state.settings.activeColumnId = columnId;
          Object.assign(state.settings, target);
          if (target.aiProvider) config.aiProvider = target.aiProvider;
          if (target.imageProvider) config.imageProvider = target.imageProvider;
        }
      });
    }
    const run = await pipeline.start(trigger || "manual", { referenceArticle, customTopic, userImages });
    response.status(202).json({ ok: true, run });
  } catch (error) {
    if (error.code === "RUN_ACTIVE") return response.status(409).json({ ok: false, error: error.message });
    next(error);
  }
});

app.post("/api/articles/:id/push", async (request, response, next) => {
  try {
    const result = await pipeline.pushExisting(request.params.id);
    response.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

const allowedArticleEdits = new Set(["title", "digest", "html", "author"]);

app.patch("/api/articles/:id", async (request, response, next) => {
  try {
    const patch = Object.fromEntries(
      Object.entries(request.body || {}).filter(([key]) => allowedArticleEdits.has(key)),
    );
    if (!Object.keys(patch).length) throw new Error("没有提供可编辑字段（title / digest / html / author）");
    let updated = null;
    await store.update((state) => {
      const article = state.articles.find((item) => item.id === request.params.id);
      if (!article) throw new Error("未找到这篇文章");
      if (article.status === "wechat_draft") throw new Error("该草稿已写入公众号，编辑请回到公众号后台");
      Object.assign(article, patch);
      if (patch.html) {
        article.previewHtml = patch.html;
        article.plainTextLength = plainTextLength(patch.html);
      }
      article.edited = true;
      updated = article;
    });
    logger.info("server", `草稿 ${request.params.id} 已编辑`, { fields: Object.keys(patch) });
    response.json({ ok: true, article: updated });
  } catch (error) {
    next(error);
  }
});

const columnFields = [
  "name",
  "theme",
  "audience",
  "tone",
  "author",
  "targetLength",
  "referenceArticle",
  "designTheme",
  "aiProvider",
  "imageProvider",
  "imageStyle",
];
const columnFieldSet = new Set(columnFields);

app.put("/api/columns", async (request, response, next) => {
  try {
    const body = request.body || {};
    const id = body.id?.trim();
    const column = Object.fromEntries(
      Object.entries(body).filter(([key]) => columnFieldSet.has(key) && String(body[key]).trim() !== ""),
    );
    if (!column.name?.trim()) throw new Error("栏目名称不能为空");
    if (!column.theme?.trim()) throw new Error("栏目主题不能为空");
    if (column.targetLength) column.targetLength = Math.min(5000, Math.max(600, Number(column.targetLength)));
    if (column.designTheme && !allowedDesignThemes.has(column.designTheme)) throw new Error("未知的公众号排版主题");
    let result = null;
    await store.update((state) => {
      const columns = state.settings.columns || (state.settings.columns = []);
      const index = id ? columns.findIndex((item) => item.id === id) : -1;
      if (index >= 0) {
        Object.assign(columns[index], column, { id });
        result = columns[index];
      } else {
        const created = { id: randomUUID(), ...column };
        columns.push(created);
        result = created;
      }
    });
    response.json({ ok: true, column: result, columns: store.snapshot().settings.columns });
  } catch (error) {
    next(error);
  }
});

app.post("/api/columns/:id/activate", async (request, response, next) => {
  try {
    const targetId = request.params.id;
    let activated = null;
    await store.update((state) => {
      const column = (state.settings.columns || []).find((item) => item.id === targetId);
      if (!column) throw new Error("未找到该栏目");
      const editorial = [
        "name",
        "theme",
        "audience",
        "tone",
        "author",
        "targetLength",
        "referenceArticle",
        "designTheme",
        "aiProvider",
        "imageProvider",
        "imageStyle",
      ];
      for (const key of editorial) {
        if (column[key] !== undefined) state.settings[key] = column[key];
      }
      state.settings.activeColumnId = targetId;
      activated = column;
      if (column.aiProvider) config.aiProvider = column.aiProvider;
      if (column.imageProvider) config.imageProvider = column.imageProvider;
    });
    logger.info("server", `切换到栏目 ${targetId}`, { name: activated.name });
    response.json({ ok: true, column: activated, settings: store.snapshot().settings });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  logger.error("server", error.message, { stack: error.stack });
  response.status(400).json({ ok: false, error: error.message || "请求失败" });
});

function zonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

async function schedulerTick() {
  const state = store.snapshot();
  const settings = state.settings;
  if (!settings.scheduleEnabled || pipeline.activeRunId) return;
  const now = zonedParts(new Date(), settings.timezone);
  const dateKey = `${now.year}-${now.month}-${now.day}`;
  const timeKey = `${now.hour}:${now.minute}`;
  if (timeKey !== settings.scheduleTime || state.scheduler.lastRunDate === dateKey) return;
  await store.update((next) => {
    next.scheduler.lastRunDate = dateKey;
  });
  await pipeline.start("schedule");
}

setInterval(() => void schedulerTick().catch((error) => logger.error("scheduler", error.message)), 30_000).unref();

const server = app.listen(config.port, config.host, () => {
  logger.info("server", `墨流已启动：${config.baseUrl}`);
});

export { app, server, store, pipeline };
