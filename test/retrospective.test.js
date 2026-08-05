import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { analyzeArticlePerformance } from "../src/retrospective.js";
import { StateStore } from "../src/storage.js";

test("analyzeArticlePerformance generates report and evolution rules", async () => {
  const article = {
    id: "test-art-1",
    title: "如何用 AI 提升团队写作效率",
    digest: "AI 写作工具落地实操教程",
    plainTextLength: 1500,
    isImitation: false,
  };
  const metrics = { reads: 3500, likes: 120, looking: 45, shares: 89 };
  const feedback = "金句部分读者转发很多，导语部分略显生硬";

  const report = await analyzeArticlePerformance({
    article,
    metrics,
    feedback,
    config: {},
    settings: { aiProvider: "codex" },
  });

  assert.equal(typeof report.summary, "string");
  assert.equal(typeof report.scoreRating, "string");
  assert.equal(Array.isArray(report.strengths), true);
  assert.equal(Array.isArray(report.weaknesses), true);
  assert.equal(Array.isArray(report.actionItems), true);
  assert.equal(Array.isArray(report.newRules), true);
  assert.equal(report.newRules.length > 0, true);
});

test("evolution rules persist and sync across state", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "moli-retro-"));
  const store = new StateStore(path.join(directory, "state.json"));
  await store.init();

  await store.update((state) => {
    state.settings.evolutionRules = ["开篇100字内必须直接抛出结论"];
  });

  const state = store.snapshot();
  assert.deepEqual(state.settings.evolutionRules, ["开篇100字内必须直接抛出结论"]);
  await fs.rm(directory, { recursive: true, force: true });
});
