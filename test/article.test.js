import test from "node:test";
import assert from "node:assert/strict";
import { buildWechatHtml, designThemes, plainTextLength, selectDesignTheme } from "../src/article.js";
import { validateGzhHtml } from "../src/gzh.js";

const article = {
  title: "测试标题",
  kicker: "栏目 · 观察",
  lead: "这是一段导语。",
  sections: [{ heading: "第一部分", paragraphs: ["正文一。", "正文二。"], callout: "关键判断。" }],
  conclusion: "结论。",
};

test("buildWechatHtml keeps uploaded image URL and removes executable markup", () => {
  const html = buildWechatHtml(
    { ...article, lead: '<script>alert("x")</script>安全导语' },
    { sources: [{ title: "来源", publisher: "出版方", url: "https://example.com" }] },
    "https://mmbiz.qpic.cn/example.png",
  );
  assert.match(html, /https:\/\/mmbiz\.qpic\.cn\/example\.png/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.ok(plainTextLength(html) > 20);
});

test("buildWechatHtml preserves the local image marker for later upload", () => {
  const html = buildWechatHtml(article, { sources: [] });
  assert.match(html, /\{\{BODY_IMAGE_URL\}\}/);
});

test("all gzh themes pass the upstream WeChat HTML validator", async () => {
  const topic = {
    angle: "AI 工具复盘",
    keywords: ["AI 工作流", "DeepSeek"],
    sources: [{ title: "项目文档", publisher: "测试来源", url: "https://example.com" }],
  };
  for (const designTheme of Object.keys(designThemes)) {
    const html = buildWechatHtml(article, topic, "https://mmbiz.qpic.cn/example.png", {
      designTheme,
      author: "主理人",
    });
    const validation = await validateGzhHtml(html);
    assert.ok(validation.leafCount > 0, designTheme);
    assert.doesNotMatch(html, /<div|<style|<script|\sclass=|\sid=/i);
  }
});

test("automatic theme selection follows the gzh topic mapping", () => {
  assert.equal(selectDesignTheme(article, { angle: "六款工具深度测评", keywords: [] }), "moyu-ticket");
  assert.equal(selectDesignTheme(article, { angle: "科技产品专业观点", keywords: [] }), "graphite-minimal");
  assert.equal(selectDesignTheme(article, { angle: "城市生活随笔", keywords: [] }), "zen-whitespace");
});

test("buildWechatHtml inserts one image per section from sectionUrls", () => {
  const twoSectionArticle = {
    title: "测试标题",
    kicker: "栏目 · 观察",
    lead: "导语。",
    sections: [
      { heading: "第一部分", paragraphs: ["正文一。"], callout: "判断一。" },
      { heading: "第二部分", paragraphs: ["正文二。"], callout: "判断二。" },
    ],
    conclusion: "结论。",
  };
  const html = buildWechatHtml(
    twoSectionArticle,
    { sources: [] },
    "https://mmbiz.qpic.cn/hero.png",
    { sectionUrls: ["https://mmbiz.qpic.cn/s0.png", "https://mmbiz.qpic.cn/s1.png"] },
  );
  const images = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(images.length, 3);
  assert.ok(images.includes("https://mmbiz.qpic.cn/hero.png"));
  assert.ok(images.includes("https://mmbiz.qpic.cn/s0.png"));
  assert.ok(images.includes("https://mmbiz.qpic.cn/s1.png"));
});

test("buildWechatHtml uses placeholders when no sectionUrls provided", () => {
  const html = buildWechatHtml(article, { sources: [] }, "{{BODY_IMAGE_URL}}", { sectionUrls: [] });
  assert.match(html, /\{\{BODY_IMAGE_URL\}\}/);
  assert.doesNotMatch(html, /\{\{SECTION_IMAGE_/);
});

