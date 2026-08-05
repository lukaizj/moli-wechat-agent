import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StateStore } from "./storage.js";
import { Pipeline } from "./pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");

const config = {
  port: Number(process.env.PORT || 3210),
  baseUrl: process.env.APP_BASE_URL || "http://localhost:3210",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  textModel: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-terra",
  imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
  wechatAppId: process.env.WECHAT_APP_ID || "",
  wechatAppSecret: process.env.WECHAT_APP_SECRET || "",
};

const store = new StateStore(path.join(dataDir, "state.json"));
await store.init();
const pipeline = new Pipeline({ store, config, generatedDir: path.join(dataDir, "generated") });
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use("/generated", express.static(path.join(dataDir, "generated")));
app.use(express.static(path.join(rootDir, "public")));

function integrationStatus() {
  return {
    openai: Boolean(config.openaiApiKey),
    wechat: Boolean(config.wechatAppId && config.wechatAppSecret),
    textModel: config.textModel,
    imageModel: config.imageModel,
  };
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, integrations: integrationStatus(), activeRunId: pipeline.activeRunId });
});

app.get("/api/state", (_request, response) => {
  response.json({ ...store.snapshot(), integrations: integrationStatus(), activeRunId: pipeline.activeRunId });
});

const allowedSettings = new Set([
  "accountName",
  "theme",
  "audience",
  "tone",
  "author",
  "targetLength",
  "imageStyle",
  "scheduleEnabled",
  "scheduleTime",
  "timezone",
  "allowComments",
  "fansOnlyComments",
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
    await store.update((state) => Object.assign(state.settings, patch));
    response.json({ ok: true, settings: store.snapshot().settings });
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs", async (request, response, next) => {
  try {
    const run = await pipeline.start(request.body?.trigger || "manual");
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

app.use((error, _request, response, _next) => {
  console.error(error);
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

setInterval(() => void schedulerTick().catch(console.error), 30_000).unref();

const server = app.listen(config.port, () => {
  console.log(`墨流已启动：${config.baseUrl}`);
});

export { app, server, store, pipeline };
