import sanitizeHtml from "sanitize-html";

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const paragraph = (text) => `<p style="margin:0 0 1.2em;font-size:16px;line-height:1.9;color:#252936;">${escapeHtml(text)}</p>`;

export function buildWechatHtml(article, topic, bodyImageUrl = "{{BODY_IMAGE_URL}}") {
  const sections = article.sections
    .map((section) => {
      const callout = section.callout
        ? `<blockquote style="margin:1.8em 0;padding:18px 20px;border-left:4px solid #ff5a49;background:#f4f6fb;color:#343949;font-size:16px;line-height:1.8;">${escapeHtml(section.callout)}</blockquote>`
        : "";
      return `<section style="margin:2.2em 0;">
        <h2 style="margin:0 0 1em;font-size:21px;line-height:1.45;color:#11182a;font-weight:700;">${escapeHtml(section.heading)}</h2>
        ${section.paragraphs.map(paragraph).join("\n")}
        ${callout}
      </section>`;
    })
    .join("\n");

  const sourceItems = (topic.sources || [])
    .slice(0, 5)
    .map((source, index) => `<li style="margin:.5em 0;">[${index + 1}] ${escapeHtml(source.title)} · ${escapeHtml(source.publisher)}</li>`)
    .join("");

  const sourceSection = sourceItems
    ? `<section style="margin-top:2.6em;padding-top:1.3em;border-top:1px solid #dfe3ec;color:#7a8091;font-size:12px;line-height:1.7;"><strong>资料来源</strong><ol style="padding-left:1.5em;">${sourceItems}</ol></section>`
    : "";

  const raw = `<div style="max-width:100%;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
    <p style="margin:0 0 .5em;color:#747b8d;font-size:13px;letter-spacing:.08em;">${escapeHtml(article.kicker)}</p>
    <p style="margin:0 0 1.4em;font-size:18px;line-height:1.75;color:#3b4050;font-weight:500;">${escapeHtml(article.lead)}</p>
    <img src="${escapeHtml(bodyImageUrl)}" alt="${escapeHtml(article.title)}" style="display:block;width:100%;height:auto;margin:1.6em 0 2.2em;border-radius:4px;" />
    ${sections}
    <section style="margin:2.5em 0 1em;padding:22px;background:#11182a;color:#fff;">
      <p style="margin:0;font-size:17px;line-height:1.85;">${escapeHtml(article.conclusion)}</p>
    </section>
    ${sourceSection}
  </div>`;

  return sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      "*": ["style"],
      img: ["src", "alt", "style"],
    },
    allowedSchemes: ["http", "https"],
  });
}

export function plainTextLength(html) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, "").length;
}
