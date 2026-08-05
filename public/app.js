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
  const contentType = response.headers.get("content-type") || "";
  let payload = {};
  if (contentType.includes("application/json")) {
    payload = await response.json();
  } else {
    const text = await response.text();
    throw new Error(`服务未能识别该请求 (${response.status})，请重启服务后重试。`);
  }
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
  const { ai, wechat } = state.integrations;
  const currentAiProvider = state.settings?.aiProvider || state.integrations.aiProvider || "codex";
  const currentImgProvider = state.settings?.imageProvider || state.integrations.imageProvider || "codex";
  const aiTextName =
    currentAiProvider === "gemini" || currentAiProvider === "antigravity"
      ? "Gemini"
      : currentAiProvider === "deepseek"
        ? "DeepSeek"
        : currentAiProvider === "codex"
          ? "ChatGPT 会员"
          : "OpenAI";
  const imgTextName =
    currentImgProvider === "gemini" || currentImgProvider === "antigravity"
      ? "Gemini"
      : currentImgProvider === "codex"
        ? "GPT"
        : "OpenAI";
  const label = `${aiTextName} 文案 + ${imgTextName} 配图`;
  $("#openai-dot").classList.toggle("ready", ai);
  $("#wechat-dot").classList.toggle("ready", wechat);
  $("#openai-label").textContent = ai ? `${label} 已就绪` : `${label} 待配置`;
  $("#wechat-label").textContent = wechat ? "已接入" : "待配置";
  $("#settings-openai").textContent = `${ai ? "●" : "○"} 内容引擎 · ${label}${ai ? " 已就绪" : " 待配置"}`;
  $("#settings-wechat").textContent = `${wechat ? "●" : "○"} 微信公众号${wechat ? " 已接入" : " 待配置"}`;
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
  const badge = article.isImitation ? '<span class="tag-imitation">✦ 范文仿写</span>' : '';
  return `<img src="${article.coverUrl}" alt="" />
    <div>
      <h4>${escapeHtml(article.title)}${badge}</h4>
      <p>${escapeHtml(article.digest)}</p>
      <footer><i class="status-dot"></i>${statusLabels[article.status]} · ${article.designThemeName || "基础排版"} · ${article.plainTextLength} 字 · ${dateText(article.createdAt, true)}</footer>
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
      (article) => {
        const badge = article.isImitation ? ' <span class="tag-imitation">✦ 仿写</span>' : '';
        return `<button class="draft-list-item ${selectedArticleId === article.id ? "active" : ""}" data-article-id="${article.id}">
        <img src="${article.coverUrl}" alt="" />
        <div><h4>${escapeHtml(article.title)}${badge}</h4><p>${statusLabels[article.status]} · ${dateText(article.createdAt, true)}</p></div>
      </button>`;
      },
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
  $("#preview-cover").referrerPolicy = "no-referrer";
  $("#preview-cover").src = article.coverUrl;
  $("#preview-html").innerHTML = article.previewHtml || article.html;
  $("#preview-why").textContent = article.topic.whyNow;
  $("#preview-keywords").innerHTML = article.topic.keywords.map((word) => `<span>${escapeHtml(word)}</span>`).join("");
  const humanizerScore = article.humanizer?.total ? ` · Humanizer ${article.humanizer.total}/50` : "";
  $("#preview-meta").textContent = `${article.designThemeName || "基础排版"}${humanizerScore} · ${article.plainTextLength} 字 · ${dateText(article.createdAt, true)}`;
  $("#preview-status").textContent = statusLabels[article.status];
  $("#preview-status").classList.toggle("wechat", article.status === "wechat_draft");
  const editable = article.status === "local_preview";
  $("#push-button").classList.toggle("hidden", !editable);
  $("#edit-button").classList.toggle("hidden", !editable);
  $("#edit-panel").classList.add("hidden");
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
  $("#run-button").classList.toggle("hidden", running);
  $("#cancel-button").classList.toggle("hidden", !running);
  $("#top-cancel-button").classList.toggle("hidden", !running);
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
  renderColumns();
  renderEvolutionRules();
  renderRetrospectiveArticleSelect();
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

async function cancelRun() {
  try {
    await api("/api/runs/cancel", { method: "POST", body: "{}" });
    toast("已中断当前运行任务");
    await loadState();
  } catch (error) {
    toast(error.message, true);
  }
}

async function restartRun() {
  try {
    await api("/api/runs/restart", { method: "POST", body: JSON.stringify({ trigger: "restart" }) });
    toast("已成功取消旧任务并重新开始生成");
    await loadState();
  } catch (error) {
    toast(error.message, true);
  }
}

function renderEvolutionRules() {
  const rules = state.settings?.evolutionRules || [];
  $("#rules-total-count").textContent = `${rules.length} 条规则`;
  const container = $("#rules-list");
  if (!container) return;
  if (!rules.length) {
    container.innerHTML = '<div class="empty-state"><span>🧠</span><strong>暂无已积累的规则</strong><p>进行推文复盘后，AI 提炼的爆款经验规则会显示在这里。</p></div>';
    return;
  }
  container.innerHTML = rules
    .map(
      (rule, index) =>
        `<div class="rule-item"><div><strong>#${index + 1}</strong> ${escapeHtml(rule)}</div><button type="button" class="rule-delete-btn" data-rule-index="${index}" title="删除该规则">✕</button></div>`
    )
    .join("");
}

function renderRetrospectiveArticleSelect() {
  const select = $("#retro-article-select");
  if (!select) return;
  const articles = state.articles || [];
  const currentVal = select.value;
  if (!articles.length) {
    select.innerHTML = '<option value="">暂无草稿或推文记录，请先生成推文</option>';
    return;
  }
  select.innerHTML = articles
    .map((a) => `<option value="${a.id}">${escapeHtml(a.title)} (${dateText(a.createdAt)})</option>`)
    .join("");
  if (currentVal && articles.some((a) => a.id === currentVal)) {
    select.value = currentVal;
  }
  const selectedArticle = articles.find((a) => a.id === select.value) || articles[0];
  if (selectedArticle) {
    populateRetrospectiveForm(selectedArticle);
    if (selectedArticle.retrospective) {
      renderRetrospectiveReport(selectedArticle.retrospective, selectedArticle.title);
    }
  }
}

function renderRetrospectiveReport(report, title = "") {
  const card = $("#retro-report-card");
  if (!report) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  $("#retro-report-title").textContent = `AI 复盘诊断报告 · ${title}`;
  $("#retro-report-rating").textContent = report.scoreRating || "综合评估";

  const strengthsHtml = (report.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const weaknessesHtml = (report.weaknesses || []).map((w) => `<li>${escapeHtml(w)}</li>`).join("");
  const actionsHtml = (report.actionItems || []).map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  const rulesHtml = (report.newRules || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");

  $("#retro-report-content").innerHTML = `
    <div class="retro-report-summary"><strong>诊断总结：</strong> ${escapeHtml(report.summary || "分析已完成")}</div>
    <div class="retro-grid">
      <div class="retro-box"><h4 class="green">✦ 优势与亮点归因</h4><ul>${strengthsHtml || "<li>整体表现稳健</li>"}</ul></div>
      <div class="retro-box"><h4 class="amber">⚠ 短板与丢分点剖析</h4><ul>${weaknessesHtml || "<li>无明显缺陷</li>"}</ul></div>
      <div class="retro-box"><h4 class="blue">⚡ 落地改进动作</h4><ul>${actionsHtml || "<li>保持当前写作节奏</li>"}</ul></div>
      <div class="retro-box"><h4 class="purple">🧠 提炼入库的 Agent 规则</h4><ul>${rulesHtml || "<li>规则已同步至记忆库</li>"}</ul></div>
    </div>
  `;
}

function populateRetrospectiveForm(article, metrics) {
  const form = $("#retrospective-form");
  if (!form) return;
  const m = metrics || article?.metrics || {};
  form.elements.reads.value = m.reads !== undefined && m.reads !== null ? m.reads : 0;
  form.elements.likes.value = m.likes !== undefined && m.likes !== null ? m.likes : 0;
  form.elements.looking.value = m.looking !== undefined && m.looking !== null ? m.looking : 0;
  form.elements.shares.value = m.shares !== undefined && m.shares !== null ? m.shares : 0;
  form.elements.feedback.value = article?.feedback || "";
}

async function syncArticleMetrics(articleId, showSuccessToast = false) {
  if (!articleId) return;
  const article = state.articles?.find((a) => a.id === articleId);
  if (article) populateRetrospectiveForm(article);

  const syncBtn = $("#sync-metrics-btn");
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.textContent = "同步中…";
  }
  try {
    const res = await api(`/api/articles/${articleId}/sync-metrics`, { method: "POST", body: "{}" });
    if (res.synced && res.metrics) {
      populateRetrospectiveForm(article, res.metrics);
      if (showSuccessToast) toast("已成功从微信公众号实时同步最新数据");
    } else if (showSuccessToast) {
      toast("已从本地数据库加载当前推文追踪面板，可在此调整指标或录入读者反馈");
    }
  } catch (error) {
    if (showSuccessToast) toast(error.message, true);
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.textContent = "🔄 同步公众号数据";
    }
  }
}

async function handleRetrospectiveSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const articleId = form.elements.articleId.value;
  if (!articleId) {
    toast("请选择要复盘的推文", true);
    return;
  }
  const reads = Number(form.elements.reads.value || 0);
  const likes = Number(form.elements.likes.value || 0);
  const looking = Number(form.elements.looking.value || 0);
  const shares = Number(form.elements.shares.value || 0);
  const feedback = form.elements.feedback.value || "";

  const submitBtn = $("#retro-submit-button");
  submitBtn.disabled = true;
  submitBtn.textContent = "AI 深入剖析归因中…";
  try {
    const res = await api(`/api/articles/${articleId}/retrospective`, {
      method: "POST",
      body: JSON.stringify({ metrics: { reads, likes, looking, shares }, feedback }),
    });
    toast("复盘诊断完成！提炼出的进化规则已存入 Agent 记忆库");
    const targetArticle = state.articles.find((a) => a.id === articleId);
    renderRetrospectiveReport(res.report, targetArticle?.title || "");
    await loadState();
  } catch (error) {
    toast(error.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "生成复盘报告并提炼规则";
  }
}

async function handleDeleteEvolutionRule(index) {
  try {
    await api(`/api/evolution-rules/${index}`, { method: "DELETE" });
    toast("已从 Agent 记忆库中移除该规则");
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
  body.humanizeEnabled = event.currentTarget.elements.humanizeEnabled.checked;
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
$("#cancel-button").addEventListener("click", cancelRun);
$("#top-cancel-button").addEventListener("click", cancelRun);
$("#restart-button").addEventListener("click", restartRun);
$("#latest-draft").addEventListener("click", () => {
  if (!state.articles[0]) return;
  selectedArticleId = state.articles[0].id;
  goTo("drafts");
});
$("#settings-form").addEventListener("submit", saveSettings);
$("#push-button").addEventListener("click", pushSelected);

async function editSelected() {
  if (!selectedArticleId) return;
  const article = state.articles.find((item) => item.id === selectedArticleId);
  if (!article) return;
  $("#edit-title").value = article.title;
  $("#edit-digest").value = article.digest;
  $("#edit-html").value = article.previewHtml || article.html;
  $("#edit-panel").classList.remove("hidden");
  $("#edit-save").disabled = false;
  $("#edit-save").textContent = "保存修改";
}

async function saveEdit() {
  if (!selectedArticleId) return;
  const button = $("#edit-save");
  button.disabled = true;
  button.textContent = "保存中…";
  try {
    const body = {
      title: $("#edit-title").value.trim(),
      digest: $("#edit-digest").value.trim(),
      html: $("#edit-html").value,
    };
    if (!body.title) throw new Error("标题不能为空");
    await api(`/api/articles/${selectedArticleId}`, { method: "PATCH", body: JSON.stringify(body) });
    toast("草稿已保存，可推送或继续预览");
    await loadState();
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "保存修改";
  }
}

function cancelEdit() {
  $("#edit-panel").classList.add("hidden");
}

function renderColumns() {
  const columns = state.settings.columns || [];
  const badge = $("#column-count");
  if (badge) badge.textContent = `${columns.length} 个`;
  const list = $("#column-list");
  if (!list) return;
  if (!columns.length) {
    list.innerHTML = '<span class="draft-list-empty">暂无栏目</span>';
    return;
  }
  list.innerHTML = columns
    .map((column) => {
      const active = column.id === state.settings.activeColumnId;
      return `<button type="button" class="column-tab ${active ? "active" : ""}" data-column-id="${column.id}">
        <span>${escapeHtml(column.name)}</span>${active ? ' <small>(当前)</small>' : ""}
      </button>`;
    })
    .join("");
  $$("[data-column-id]", list).forEach((btn) => {
    const id = btn.dataset.columnId;
    btn.addEventListener("click", () => activateColumn(id));
  });
}

async function activateColumn(id) {
  try {
    await api(`/api/columns/${id}/activate`, { method: "POST", body: "{}" });
    toast("已切换栏目，下一次运行将使用新设定");
    await loadState();
  } catch (error) {
    toast(error.message, true);
  }
}

let uploadedImagePaths = [];

function renderImagePreviews() {
  const container = $("#imitate-image-preview");
  if (!container) return;
  container.innerHTML = uploadedImagePaths
    .map(
      (item, idx) => `<div class="preview-thumb-item">
        <img src="${item.url}" alt="" />
        <span class="thumb-label">${idx === 0 ? "主封面" : `小节 ${idx}`}</span>
        <button type="button" class="thumb-remove" data-idx="${idx}">✕</button>
      </div>`,
    )
    .join("");
  $$(".thumb-remove", container).forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      uploadedImagePaths.splice(idx, 1);
      renderImagePreviews();
    }),
  );
}

async function handleImageSelect(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  const readBase64 = (file) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ data: reader.result, name: file.name });
      reader.readAsDataURL(file);
    });
  try {
    const images = await Promise.all(files.map(readBase64));
    const res = await api("/api/upload-images", {
      method: "POST",
      body: JSON.stringify({ images }),
    });
    uploadedImagePaths.push(...(res.files || []));
    renderImagePreviews();
    toast(`已成功上传 ${res.files.length} 张自定义排版图片`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    event.target.value = "";
  }
}

function openImitateModal() {
  uploadedImagePaths = [];
  renderImagePreviews();
  $("#imitate-reference-input").value = "";
  $("#imitate-topic-input").value = "";
  $("#imitate-modal").classList.remove("hidden");
}

function closeImitateModal() {
  $("#imitate-modal").classList.add("hidden");
}

async function startImitationRun() {
  const referenceArticle = $("#imitate-reference-input").value.trim();
  const customTopic = $("#imitate-topic-input").value.trim();
  if (!referenceArticle && !customTopic && !uploadedImagePaths.length) {
    toast("请粘贴参考推文、填写选题或上传自定义图片", true);
    return;
  }
  const button = $("#imitate-run-button");
  button.disabled = true;
  button.textContent = "启动中…";
  try {
    await api("/api/runs", {
      method: "POST",
      body: JSON.stringify({
        referenceArticle,
        customTopic,
        userImages: uploadedImagePaths.map((item) => item.path),
        trigger: "manual",
      }),
    });
    toast("已开始运行排版生成，可在界面查看流程动态");
    closeImitateModal();
    await loadState();
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "开始模仿生成并送草稿箱";
  }
}

$("#imitate-image-select").addEventListener("click", () => $("#imitate-image-input").click());
$("#imitate-image-input").addEventListener("change", handleImageSelect);
$("#imitate-modal-open-button").addEventListener("click", openImitateModal);
$("#imitate-modal-close").addEventListener("click", closeImitateModal);
$("#imitate-cancel-button").addEventListener("click", closeImitateModal);
$("#imitate-run-button").addEventListener("click", startImitationRun);
$("#edit-button").addEventListener("click", editSelected);
$("#edit-save").addEventListener("click", saveEdit);
$("#edit-cancel").addEventListener("click", cancelEdit);
$("#retrospective-form")?.addEventListener("submit", handleRetrospectiveSubmit);
$("#rules-list")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".rule-delete-btn");
  if (btn) {
    const index = Number(btn.dataset.ruleIndex);
    handleDeleteEvolutionRule(index);
  }
});
$("#sync-metrics-btn")?.addEventListener("click", () => {
  const articleId = $("#retro-article-select")?.value;
  if (!articleId) return toast("请选择要同步的推文", true);
  syncArticleMetrics(articleId, true);
});
$("#retro-article-select")?.addEventListener("change", (e) => {
  const articleId = e.target.value;
  if (!articleId) return;
  const article = state.articles?.find((a) => a.id === articleId);
  if (article) {
    populateRetrospectiveForm(article);
    if (article.retrospective) {
      renderRetrospectiveReport(article.retrospective, article.title);
    } else {
      renderRetrospectiveReport(null);
    }
  }
  syncArticleMetrics(articleId, false);
});

await loadState();
