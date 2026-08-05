import sanitizeHtml from "sanitize-html";

export const designThemes = {
  "moyu-green": {
    name: "摸鱼绿",
    primary: "#059669",
    dark: "#111827",
    text: "#374151",
    muted: "#6B7280",
    pale: "#ECFDF5",
    line: "#BBF7D0",
    underline: "border-bottom:2px solid #A7F3D0;font-weight:600;",
    background: "#FFFFFF",
    bodySize: "14px",
    lineHeight: "1.9",
  },
  "red-white": {
    name: "红白色系",
    primary: "#DC2626",
    dark: "#1C1917",
    text: "#374151",
    muted: "#9CA3AF",
    pale: "#FEF2F2",
    line: "#FECACA",
    underline: "border-bottom:2px solid #FECACA;font-weight:600;",
    background: "#FFFFFF",
    bodySize: "15px",
    lineHeight: "1.8",
  },
  "graphite-minimal": {
    name: "石墨极简风",
    primary: "#52525B",
    dark: "#27272A",
    text: "#52525B",
    muted: "#A1A1AA",
    pale: "#FAFAFA",
    line: "#E4E4E7",
    underline: "border-bottom:2px solid #52525B;font-weight:600;",
    background: "#FFFFFF",
    bodySize: "15px",
    lineHeight: "1.8",
  },
  "zen-whitespace": {
    name: "留白禅意风",
    primary: "#4A5D52",
    dark: "#2B2B2B",
    text: "#525252",
    muted: "#A3A3A3",
    pale: "#EEF3F0",
    line: "#E8E8E8",
    underline: "border-bottom:1.5px solid #B5C8BC;font-weight:500;",
    background: "#FFFFFF",
    bodySize: "15px",
    lineHeight: "1.9",
  },
  "moyu-ticket": {
    name: "摸鱼票据风",
    primary: "#059669",
    dark: "#1A1A1A",
    text: "#555555",
    muted: "#888888",
    pale: "#FFFEF8",
    line: "#A7F3D0",
    underline: "border-bottom:2px solid #A7F3D0;font-weight:600;",
    background: "#FFFEF8",
    bodySize: "14px",
    lineHeight: "1.9",
  },
  "olive-journal": {
    name: "橄榄手记",
    primary: "#ED7B2F",
    dark: "#1E1F23",
    text: "#4D4F46",
    muted: "#9EA096",
    pale: "#EEEFE9",
    line: "#BFC1B7",
    underline: "border-bottom:2px solid #ED7B2F;font-weight:600;color:#23251D;",
    background: "#FDFDF8",
    bodySize: "14px",
    lineHeight: "1.9",
  },
};

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function normalizePunctuation(value = "") {
  const text = String(value);
  if (!/[一-鿿㐀-䶿]/u.test(text)) return text;
  let doubleOpen = true;
  let singleOpen = true;
  return text
    .replaceAll(",", "，")
    .replaceAll(";", "；")
    .replaceAll("!", "！")
    .replaceAll("?", "？")
    .replaceAll(":", "：")
    .replaceAll('"', () => ((doubleOpen = !doubleOpen) ? "”" : "“"))
    .replaceAll("'", () => ((singleOpen = !singleOpen) ? "’" : "‘"));
}

const leaf = (text, style = "") =>
  `<span leaf=""${style ? ` style="${style}"` : ""}>${escapeHtml(normalizePunctuation(text))}</span>`;

function markedText(text, keywords, theme) {
  const normalized = normalizePunctuation(text);
  const candidates = [...new Set((keywords || []).map(normalizePunctuation))]
    .filter((word) => word.length >= 2 && word.length <= 24 && normalized.includes(word))
    .slice(0, 2);
  if (!candidates.length) {
    const fallback = normalized.split(/[，。；！？]/u).find((part) => part.trim().length >= 4)?.trim().slice(0, 15);
    if (fallback) candidates.push(fallback);
  }
  const ranges = candidates
    .map((word) => ({ start: normalized.indexOf(word), end: normalized.indexOf(word) + word.length }))
    .filter((range) => range.start >= 0)
    .sort((a, b) => a.start - b.start)
    .filter((range, index, all) => index === 0 || range.start >= all[index - 1].end);
  if (!ranges.length) return leaf(normalized);
  const parts = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) parts.push(leaf(normalized.slice(cursor, range.start)));
    parts.push(leaf(normalized.slice(range.start, range.end), theme.underline));
    cursor = range.end;
  }
  if (cursor < normalized.length) parts.push(leaf(normalized.slice(cursor)));
  return parts.join("");
}

export function selectDesignTheme(article, topic, preferred = "auto") {
  if (designThemes[preferred]) return preferred;
  const haystack = [article.title, article.kicker, topic.angle, ...(topic.keywords || [])].join(" ");
  if (/禅|生活|随笔|艺术|冥想/u.test(haystack)) return "zen-whitespace";
  if (/对比|测评|评测|榜单/u.test(haystack)) return "moyu-ticket";
  if (/复盘|案例|内刊|系统性|说明文档/u.test(haystack)) return "olive-journal";
  if (/教程|清单|工具|步骤|方法/u.test(haystack)) return "moyu-green";
  if (/品牌|设计|科技|专业/u.test(haystack)) return "graphite-minimal";
  return "red-white";
}

function introStyle(themeId, theme) {
  if (themeId === "moyu-ticket") {
    return `margin:16px 12px 28px;padding:22px;border:2px solid ${theme.dark};box-shadow:5px 5px 0 ${theme.dark};background:${theme.pale};`;
  }
  if (themeId === "zen-whitespace" || themeId === "graphite-minimal") {
    return `margin:20px 16px 38px;padding:24px 8px;border-top:1px solid ${theme.line};border-bottom:1px solid ${theme.line};text-align:center;`;
  }
  return `margin:16px 12px 30px;padding:22px;border-left:4px solid ${theme.primary};background:${theme.pale};`;
}

function sectionHeading(section, index, theme) {
  const number = String(index + 1).padStart(2, "0");
  return `<section style="margin:48px 12px 22px;padding-top:18px;border-top:1px solid ${theme.line};">
    <p style="margin:0 0 8px;color:${theme.primary};font-size:12px;letter-spacing:2px;line-height:1;">${leaf(number)}</p>
    <h2 style="margin:0;color:${theme.dark};font-size:21px;line-height:1.5;font-weight:700;">${leaf(section.heading)}</h2>
  </section>`;
}

export function buildWechatHtml(article, topic, bodyImageUrl = "{{BODY_IMAGE_URL}}", options = {}) {
  const themeId = selectDesignTheme(article, topic, options.designTheme);
  const theme = designThemes[themeId];
  const keywords = topic.keywords || [];
  const sectionUrls = options.sectionUrls || [];
  const sections = article.sections
    .map((section, index) => {
      const paragraphs = section.paragraphs
        .map(
          (text) =>
            `<p style="margin:0 12px 22px;color:${theme.text};font-size:${theme.bodySize};line-height:${theme.lineHeight};letter-spacing:.3px;">${markedText(text, keywords, theme)}</p>`,
        )
        .join("\n");
      const callout = section.callout
        ? `<section style="margin:28px 12px;padding:18px 20px;border-left:4px solid ${theme.primary};background:${theme.pale};color:${theme.dark};font-size:${theme.bodySize};line-height:${theme.lineHeight};">${leaf(section.callout)}</section>`
        : "";
      const sectionImage = sectionUrls[index]
        ? `<section style="margin:0 12px 30px;"><img src="${escapeHtml(sectionUrls[index])}" alt="${escapeHtml(normalizePunctuation(section.heading))}" referrerpolicy="no-referrer" style="display:block;width:100%;height:auto;margin:0;border-radius:4px;" /></section>`
        : "";
      return `${sectionHeading(section, index, theme)}\n${paragraphs}\n${callout}\n${sectionImage}`;
    })
    .join("\n");

  const sourceItems = (topic.sources || [])
    .slice(0, 5)
    .map(
      (source, index) =>
        `<li style="margin:8px 0;color:${theme.muted};font-size:12px;line-height:1.7;">${leaf(`[${index + 1}] `)}<a href="${escapeHtml(source.url)}" style="color:${theme.muted};text-decoration:none;">${leaf(source.title)}</a>${leaf(` · ${source.publisher}`)}</li>`,
    )
    .join("");
  const sourceSection = sourceItems
    ? `<section style="margin:42px 12px 0;padding-top:18px;border-top:1px solid ${theme.line};"><p style="margin:0 0 8px;color:${theme.dark};font-size:12px;font-weight:700;">${leaf("资料来源")}</p><ol style="margin:0;padding-left:22px;">${sourceItems}</ol></section>`
    : "";
  const authorSection = options.author
    ? `<section style="margin:34px 12px 4px;padding:18px 0;border-top:1px solid ${theme.line};text-align:center;"><p style="margin:0;color:${theme.muted};font-size:12px;line-height:1.8;">${leaf(`作者 · ${options.author}`)}</p></section>`
    : "";

  const raw = `<section style="max-width:677px;margin:0 auto;padding:8px 0 24px;box-sizing:border-box;overflow-x:hidden;background:${theme.background};color:${theme.text};font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;line-height:${theme.lineHeight};">
    <section style="${introStyle(themeId, theme)}">
      <p style="margin:0 0 10px;color:${theme.primary};font-size:12px;letter-spacing:1.5px;line-height:1.4;">${leaf(article.kicker)}</p>
      <p style="margin:0;color:${theme.dark};font-size:18px;line-height:1.75;font-weight:600;">${markedText(article.lead, keywords, theme)}</p>
    </section>
    <section style="margin:0 12px 38px;">
      <img src="${escapeHtml(bodyImageUrl)}" alt="${escapeHtml(normalizePunctuation(article.title))}" referrerpolicy="no-referrer" style="display:block;width:100%;height:auto;margin:0;border-radius:4px;" />
    </section>
    ${sections}
    <section style="margin:42px 12px 10px;padding:22px;background:${theme.dark};color:#FFFFFF;">
      <p style="margin:0;color:#FFFFFF;font-size:16px;line-height:1.85;">${leaf(article.conclusion)}</p>
    </section>
    ${sourceSection}
    ${authorSection}
  </section>`;

  return sanitizeHtml(raw, {
    allowedTags: ["section", "p", "span", "strong", "img", "h2", "ol", "li", "a"],
    allowedAttributes: {
      "*": ["style", "leaf"],
      img: ["src", "alt", "style", "referrerpolicy"],
      a: ["href", "style"],
    },
    allowedSchemes: ["http", "https"],
  });
}

export function plainTextLength(html) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, "").length;
}
