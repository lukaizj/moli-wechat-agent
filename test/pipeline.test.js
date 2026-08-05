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
