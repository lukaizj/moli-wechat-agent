import fs from "node:fs/promises";
import path from "node:path";

const API = "https://api.weixin.qq.com/cgi-bin";

function assertWechatSuccess(payload, action) {
  if (payload.errcode && payload.errcode !== 0) {
    throw new Error(`${action}失败：${payload.errcode} ${payload.errmsg || "未知错误"}`);
  }
  return payload;
}

async function parseResponse(response, action) {
  const payload = await response.json();
  if (!response.ok) throw new Error(`${action}失败：HTTP ${response.status}`);
  return assertWechatSuccess(payload, action);
}

export async function getStableAccessToken(config, fetchImpl = fetch) {
  const response = await fetchImpl(`${API}/stable_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credential",
      appid: config.wechatAppId,
      secret: config.wechatAppSecret,
      force_refresh: false,
    }),
  });
  const payload = await parseResponse(response, "获取公众号凭据");
  if (!payload.access_token) throw new Error("获取公众号凭据失败：响应缺少 access_token");
  return payload.access_token;
}

async function imageForm(filePath) {
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append("media", new Blob([bytes], { type: "image/png" }), path.basename(filePath));
  return form;
}

export async function uploadArticleImage(accessToken, filePath, fetchImpl = fetch) {
  const response = await fetchImpl(`${API}/media/uploadimg?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    body: await imageForm(filePath),
  });
  const payload = await parseResponse(response, "上传正文图片");
  if (!payload.url) throw new Error("上传正文图片失败：响应缺少 url");
  return payload.url;
}

export async function uploadPermanentCover(accessToken, filePath, fetchImpl = fetch) {
  const response = await fetchImpl(
    `${API}/material/add_material?access_token=${encodeURIComponent(accessToken)}&type=image`,
    { method: "POST", body: await imageForm(filePath) },
  );
  const payload = await parseResponse(response, "上传封面素材");
  if (!payload.media_id) throw new Error("上传封面素材失败：响应缺少 media_id");
  return payload.media_id;
}

export async function addDraft(accessToken, article, settings, fetchImpl = fetch) {
  const response = await fetchImpl(`${API}/draft/add?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      articles: [
        {
          title: article.title,
          author: settings.author,
          digest: article.digest,
          content: article.html,
          thumb_media_id: article.thumbMediaId,
          show_cover_pic: 1,
          need_open_comment: settings.allowComments ? 1 : 0,
          only_fans_can_comment: settings.fansOnlyComments ? 1 : 0,
        },
      ],
    }),
  });
  const payload = await parseResponse(response, "写入公众号草稿箱");
  if (!payload.media_id) throw new Error("写入公众号草稿箱失败：响应缺少 media_id");
  return payload.media_id;
}

export async function getArticleTotalData(accessToken, beginDate, endDate, fetchImpl = fetch) {
  const response = await fetchImpl(
    `https://api.weixin.qq.com/datacube/getarticletotal?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ begin_date: beginDate, end_date: endDate }),
    },
  );
  const payload = await parseResponse(response, "获取公众号文章数据");
  return payload.list || [];
}

export async function scrapeWechatMetrics(url, fetchImpl = fetch) {
  if (!url || !url.startsWith("http")) return null;
  try {
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });
    if (!response.ok) return null;
    const html = await response.text();

    const readsMatch =
      html.match(/read_num\s*[:=]\s*["']?(\d+)["']?/i) ||
      html.match(/["']read_num["']\s*:\s*(\d+)/i) ||
      html.match(/read_count\s*[:=]\s*["']?(\d+)["']?/i);

    const likesMatch =
      html.match(/like_num\s*[:=]\s*["']?(\d+)["']?/i) ||
      html.match(/["']like_num["']\s*:\s*(\d+)/i) ||
      html.match(/like_count\s*[:=]\s*["']?(\d+)["']?/i);

    const lookingMatch =
      html.match(/old_like_num\s*[:=]\s*["']?(\d+)["']?/i) ||
      html.match(/["']old_like_num["']\s*:\s*(\d+)/i) ||
      html.match(/looking_num\s*[:=]\s*["']?(\d+)["']?/i);

    const sharesMatch =
      html.match(/share_num\s*[:=]\s*["']?(\d+)["']?/i) ||
      html.match(/["']share_num["']\s*:\s*(\d+)/i) ||
      html.match(/share_count\s*[:=]\s*["']?(\d+)["']?/i);

    const reads = readsMatch ? Number(readsMatch[1]) : 0;
    const likes = likesMatch ? Number(likesMatch[1]) : 0;
    const looking = lookingMatch ? Number(lookingMatch[1]) : 0;
    const shares = sharesMatch ? Number(sharesMatch[1]) : 0;

    return { reads, likes, looking, shares };
  } catch (err) {
    return null;
  }
}
