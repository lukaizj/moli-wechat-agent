import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateStore } from "../src/storage.js";

test("StateStore persists settings atomically", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "moli-store-"));
  const filePath = path.join(directory, "state.json");
  const store = new StateStore(filePath);
  await store.init();
  await store.update((state) => {
    state.settings.theme = "城市微旅行";
  });

  const reopened = new StateStore(filePath);
  await reopened.init();
  assert.equal(reopened.snapshot().settings.theme, "城市微旅行");
  await fs.rm(directory, { recursive: true, force: true });
});
