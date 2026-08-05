import test from "node:test";
import assert from "node:assert/strict";
import { deepSeekClientOptions, deepSeekRequestBody, parseDeepSeekJson } from "../src/deepseek.js";

test("DeepSeek uses the official OpenAI-compatible endpoint", () => {
  assert.deepEqual(deepSeekClientOptions({ deepseekApiKey: "secret" }), {
    apiKey: "secret",
    baseURL: "https://api.deepseek.com",
  });
});

test("DeepSeek requests JSON output with the configured model", () => {
  const body = deepSeekRequestBody({
    prompt: "写文章",
    schema: { type: "object" },
    config: { deepseekModel: "deepseek-v4-flash", deepseekMaxTokens: 4096 },
  });
  assert.equal(body.model, "deepseek-v4-flash");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(body.max_tokens, 4096);
});

test("DeepSeek JSON parser accepts plain JSON and fenced JSON", () => {
  assert.deepEqual(parseDeepSeekJson('{"ok":true}'), { ok: true });
  assert.deepEqual(parseDeepSeekJson('```json\n{"ok":true}\n```'), { ok: true });
});
