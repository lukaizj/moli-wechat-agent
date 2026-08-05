import test from "node:test";
import assert from "node:assert/strict";
import { addDraft, getStableAccessToken } from "../src/wechat.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("getStableAccessToken uses the stable token endpoint", async () => {
  let captured;
  const token = await getStableAccessToken(
    { wechatAppId: "wx-app", wechatAppSecret: "secret" },
    async (url, options) => {
      captured = { url, body: JSON.parse(options.body) };
      return jsonResponse({ access_token: "token-123", expires_in: 7200 });
    },
  );
  assert.equal(token, "token-123");
  assert.match(captured.url, /\/cgi-bin\/stable_token$/);
  assert.deepEqual(captured.body, {
    grant_type: "client_credential",
    appid: "wx-app",
    secret: "secret",
    force_refresh: false,
  });
});

test("addDraft sends a single reviewable article and returns media_id", async () => {
  let body;
  const mediaId = await addDraft(
    "token",
    { title: "标题", digest: "摘要", html: "<p>正文</p>", thumbMediaId: "thumb-id" },
    { author: "作者", allowComments: true, fansOnlyComments: false },
    async (_url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse({ media_id: "draft-id" });
    },
  );
  assert.equal(mediaId, "draft-id");
  assert.equal(body.articles.length, 1);
  assert.equal(body.articles[0].thumb_media_id, "thumb-id");
  assert.equal(body.articles[0].need_open_comment, 1);
  assert.equal(body.articles[0].only_fans_can_comment, 0);
});

test("WeChat API errors include platform error details", async () => {
  await assert.rejects(
    () => getStableAccessToken(
      { wechatAppId: "wx-app", wechatAppSecret: "bad" },
      async () => jsonResponse({ errcode: 40013, errmsg: "invalid appid" }),
    ),
    /40013 invalid appid/,
  );
});
