import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Pipeline } from "../src/pipeline.js";
import { StateStore } from "../src/storage.js";

test("demo pipeline completes a local reviewable draft without credentials", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "moli-pipeline-"));
  const store = new StateStore(path.join(directory, "state.json"));
  await store.init();
  const pipeline = new Pipeline({
    store,
    generatedDir: path.join(directory, "generated"),
    config: { openaiApiKey: "", wechatAppId: "", wechatAppSecret: "" },
  });

  const run = await pipeline.start("test");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const current = store.snapshot().runs.find((item) => item.id === run.id);
    if (["completed", "failed"].includes(current.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  const state = store.snapshot();
  const completed = state.runs.find((item) => item.id === run.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.steps.find((step) => step.key === "wechat").status, "skipped");
  assert.equal(state.articles.length, 1);
  assert.equal(state.articles[0].status, "local_preview");
  assert.match(state.articles[0].html, /\{\{BODY_IMAGE_URL\}\}/);
  assert.equal((await fs.stat(state.articles[0].coverPath)).isFile(), true);
  await fs.rm(directory, { recursive: true, force: true });
});

test("pipeline accepts referenceArticle and customTopic options for imitation mode", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "moli-imitation-"));
  const store = new StateStore(path.join(directory, "state.json"));
  await store.init();
  const pipeline = new Pipeline({
    store,
    generatedDir: path.join(directory, "generated"),
    config: { openaiApiKey: "", wechatAppId: "", wechatAppSecret: "" },
  });

  const refArticle = "这是一篇关于爆款思维的范文，强调开门见山提出反常识观点。";
  const run = await pipeline.start("manual", {
    referenceArticle: refArticle,
    customTopic: "如何用 AI 重构个人知识库",
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const current = store.snapshot().runs.find((item) => item.id === run.id);
    if (["completed", "failed"].includes(current.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  const state = store.snapshot();
  const article = state.articles[0];
  assert.equal(article.topic.title, "如何用 AI 重构个人知识库");
  assert.equal(article.isImitation, true);
  await fs.rm(directory, { recursive: true, force: true });
});

test("pipeline incorporates userImages into cover and section layout", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "moli-user-img-"));
  const img1 = path.join(directory, "img1.png");
  const img2 = path.join(directory, "img2.png");
  await fs.writeFile(img1, "fake-image-1", "utf8");
  await fs.writeFile(img2, "fake-image-2", "utf8");

  const store = new StateStore(path.join(directory, "state.json"));
  await store.init();
  const pipeline = new Pipeline({
    store,
    generatedDir: path.join(directory, "generated"),
    config: { openaiApiKey: "", wechatAppId: "", wechatAppSecret: "" },
  });

  const run = await pipeline.start("manual", {
    userImages: [img1, img2],
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const current = store.snapshot().runs.find((item) => item.id === run.id);
    if (["completed", "failed"].includes(current.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  const state = store.snapshot();
  const article = state.articles[0];
  assert.equal(await fs.readFile(article.coverPath, "utf8"), "fake-image-1");
  assert.equal(await fs.readFile(article.sectionImagePaths[0], "utf8"), "fake-image-2");
  await fs.rm(directory, { recursive: true, force: true });
});

test("pipeline supports manual cancellation of active run", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "moli-cancel-"));
  const store = new StateStore(path.join(directory, "state.json"));
  await store.init();
  const pipeline = new Pipeline({
    store,
    generatedDir: path.join(directory, "generated"),
    config: { openaiApiKey: "", wechatAppId: "", wechatAppSecret: "" },
  });

  const run = await pipeline.start("manual");
  const cancelled = await pipeline.cancel(run.id);
  assert.equal(cancelled, true);

  const state = store.snapshot();
  const current = state.runs.find((item) => item.id === run.id);
  assert.equal(current.status, "cancelled");
  assert.equal(pipeline.activeRunId, null);
  await fs.rm(directory, { recursive: true, force: true });
});
