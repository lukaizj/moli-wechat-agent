let state = null;
let selectedArticleId = null;
let pollTimer = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const statusLabels = {
  queued: "排队中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  local_preview: "本地预览",
  wechat_draft: "公众号草稿",
};

function toast(message, isError = false) {
  const element = $("#toast");
  element.textContent = message;
  element.className = `toast show${isError ? " error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (element.className = "toast"), 3200);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(payload.error || "请求失败");
  return payload;
}

function dateText(value, withTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function escapeHtml(value = "") {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function goTo(view) {
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$(".view").forEach((panel) => panel.classList.toggle("active", panel.id === `view-${view}`));
  const titles = {
    dashboard: "今天，让 Agent 先动笔",
    drafts: "草稿停在最后一道决定前",
    settings: "设定这本刊物的长期方向",
  };
  $("#page-title").textContent = titles[view];
  if (view === "drafts" && !selectedArticleId && state.articles[0]) selectArticle(state.articles[0].id);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderIntegrations() {
  const { openai, ai = openai, aiProvider, wechat } = state.integrations;
  const aiName = aiProvider === "codex" ? "ChatGPT 会员" : "OpenAI API";
  $("#openai-dot").classList.toggle("ready", ai);
  $("#wechat-dot").classList.toggle("ready", wechat);
  $("#openai-label").textContent = ai ? `${aiName}已接入` : `${aiName}待登录`;
  $("#wechat-label").textContent = wechat ? "已接入" : "待配置";
  $("#settings-openai").textContent = `${ai ? "●" : "○"} 内容引擎 · ${aiName}${ai ? "已接入" : "待登录"}`;
  $("#settings-wechat").textContent = `${wechat ? "●" : "○"} 微信公众号${wechat ? "已接入" : "待配置"}`;
  $("#settings-openai").classList.toggle("ready", ai);
  $("#settings-wechat").classList.toggle("ready", wechat);
}

function renderSettingsSummary() {
  const settings = state.settings;
  $("#theme-summary").textContent = settings.theme;
  $("#audience-summary").textContent = settings.audience;
  $("#tone-summary").textContent = settings.tone;
  $("#length-summary").textContent = `约 ${settings.targetLength} 字`;
  $("#schedule-dot").classList.toggle("ready", settings.scheduleEnabled);
  $("#schedule-label").textContent = settings.scheduleEnabled ? "定时任务已开启" : "定时任务未开启";
  $("#schedule-time").textContent = settings.scheduleEnabled ? `每天 ${settings.scheduleTime}` : "手动运行";

  const form = $("#settings-form");
  for (const [key, value] of Object.entries(settings)) {
    const input = form.elements.namedItem(key);
    if (!input) continue;
    if (input.type === "checkbox") input.checked = Boolean(value);
    else input.value = value;
  }
}

function articleCard(article) {
  return `<img src="${article.coverUrl}" alt="" />
    <div>
      <h4>${escapeHtml(article.title)}</h4>
      <p>${escapeHtml(article.digest)}</p>
      <footer><i class="status-dot"></i>${statusLabels[article.status]} · ${article.plainTextLength} 字 · ${dateText(article.createdAt, true)}</footer>
    </div>`;
}

function renderLatest() {
  const article = state.articles[0];
  $("#draft-count").textContent = state.articles.length;
  $("#draft-total").textContent = `${state.articles.length} 篇`;
  $("#latest-empty").classList.toggle("hidden", Boolean(article));
  $("#latest-draft").classList.toggle("hidden", !article);
  if (article) $("#latest-draft").innerHTML = articleCard(article);
}

function renderDraftList() {
  const list = $("#draft-list");
  if (!state.articles.length) {
    list.innerHTML = '<div class="draft-list-empty">还没有草稿。先生成今天的第一篇。</div>';
    return;
  }
  list.innerHTML = state.articles
    .map(
      (article) => `<button class="draft-list-item ${selectedArticleId === article.id ? "active" : ""}" data-article-id="${article.id}">
        <img src="${article.coverUrl}" alt="" />
        <div><h4>${escapeHtml(article.title)}</h4><p>${statusLabels[article.status]} · ${dateText(article.createdAt, true)}</p></div>
      </button>`,
    )
    .join("");
  $$("[data-article-id]", list).forEach((button) => button.addEventListener("click", () => selectArticle(button.dataset.articleId)));
}

function selectArticle(articleId) {
  selectedArticleId = articleId;
  const article = state.articles.find((item) => item.id === articleId);
  if (!article) return;
  $("#preview-empty").classList.add("hidden");
  $("#article-preview").classList.remove("hidden");
  $("#preview-title").textContent = article.title;
  $("#preview-date").textContent = dateText(article.createdAt);
  $("#preview-account").textContent = state.settings.accountName;
  $("#preview-cover").src = article.coverUrl;
  $("#preview-html").innerHTML = article.html;
  $("#preview-why").textContent = article.topic.whyNow;
  $("#preview-keywords").innerHTML = article.topic.keywords.map((word) => `<span>${escapeHtml(word)}</span>`).join("");
  $("#preview-meta").textContent = `${article.plainTextLength} 字 · ${dateText(article.createdAt, true)}`;
  $("#preview-status").textContent = statusLabels[article.status];
  $("#preview-status").classList.toggle("wechat", article.status === "wechat_draft");
  $("#push-button").classList.toggle("hidden", article.status === "wechat_draft");
  $("#wechat-review-link").classList.toggle("hidden", article.status !== "wechat_draft");
  renderDraftList();
}

function renderRuns() {
  const runs = state.runs.slice(0, 4);
  const log = $("#run-log");
  if (!runs.length) {
    log.innerHTML = '<div class="empty-state"><span>↻</span><strong>还没有运行记录</strong><p>每次选题、成稿和入草稿箱都会留下状态。</p></div>';
  } else {
    log.innerHTML = runs
      .map((run) => {
        const detail = run.error || run.steps.findLast((step) => step.status === "done")?.detail || (run.mode === "demo" ? "演示运行" : "正式运行");
        return `<div class="log-row ${run.status}"><i></i><div><strong>${statusLabels[run.status]} · ${run.trigger === "schedule" ? "定时任务" : "手动任务"}</strong><small>${escapeHtml(detail)}</small></div><time>${dateText(run.createdAt, true)}</time></div>`;
      })
      .join("");
  }

  const activeRun = state.runs.find((run) => ["queued", "running"].includes(run.status));
  $$(".spine-step").forEach((element) => {
    const step = activeRun?.steps.find((item) => item.key === element.dataset.step);
    element.className = `spine-step${step ? ` ${step.status}` : ""}`;
    const small = $("small", element);
    if (!element.dataset.defaultText) element.dataset.defaultText = small.textContent;
    small.textContent = step?.detail || element.dataset.defaultText;
  });
  const running = Boolean(activeRun || state.activeRunId);
  $("#run-button").disabled = running;
  $("#run-button strong").textContent = running ? "Agent 正在工作" : "生成今日文章";
  $("#agent-status-text").textContent = running ? "Agent 运行中" : "Agent 待命";
  $(".agent-status").classList.toggle("running", running);
  if (running && !pollTimer) pollTimer = setInterval(loadState, 1300);
  if (!running && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function render() {
  renderIntegrations();
  renderSettingsSummary();
  renderLatest();
  renderDraftList();
  renderRuns();
  if (selectedArticleId) selectArticle(selectedArticleId);
}

async function loadState() {
  try {
    state = await api("/api/state");
    render();
  } catch (error) {
    toast(error.message, true);
  }
}

async function startRun() {
  try {
    await api("/api/runs", { method: "POST", body: JSON.stringify({ trigger: "manual" }) });
    toast((state.integrations.ai ?? state.integrations.openai) ? "已开始研究选题，完成后会自动进入草稿箱" : "已启动演示流程，登录内容引擎后会生成正式稿");
    await loadState();
  } catch (error) {
    toast(error.message, true);
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const body = Object.fromEntries(formData.entries());
  body.targetLength = Number(body.targetLength);
  body.scheduleEnabled = event.currentTarget.elements.scheduleEnabled.checked;
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify(body) });
    toast("公众号设定已保存");
    await loadState();
  } catch (error) {
    toast(error.message, true);
  }
}

async function pushSelected() {
  if (!selectedArticleId) return;
  const button = $("#push-button");
  button.disabled = true;
  button.textContent = "正在写入…";
  try {
    await api(`/api/articles/${selectedArticleId}/push`, { method: "POST", body: "{}" });
    toast("已写入公众号草稿箱，现在可以审核发布");
    await loadState();
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "写入公众号草稿箱";
  }
}

const now = new Date();
$("#today-label").textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);
$$(".nav-item").forEach((button) => button.addEventListener("click", () => goTo(button.dataset.view)));
$$('[data-go]').forEach((button) => button.addEventListener("click", () => goTo(button.dataset.go)));
$("#refresh-button").addEventListener("click", loadState);
$("#run-button").addEventListener("click", startRun);
$("#latest-draft").addEventListener("click", () => {
  if (!state.articles[0]) return;
  selectedArticleId = state.articles[0].id;
  goTo("drafts");
});
$("#settings-form").addEventListener("submit", saveSettings);
$("#push-button").addEventListener("click", pushSelected);

await loadState();
