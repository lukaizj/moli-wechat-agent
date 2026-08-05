# 墨流 (Moli WeChat Agent)：微信公众号内容自动化 Agent

**墨流 (Moli WeChat Agent)** 是一个全流程自动化的微信公众号内容 Agent。从指定的公众号定位与长期主题出发，自动完成**联网信号研究**、**自主选题**、**中文初稿撰写**、**Humanizer 去 AI 味二次编辑**、**AI 配图生成**、**公众号内联 HTML 排版校验**，并最终**将草稿写入微信公众号草稿箱**，停在人工审核发布之前。

---

## 🌟 核心特性

- 🤖 **全流程自动化流水线**：联网搜集最近 7 天有效信号自主选题 ➔ 生成中文初稿 ➔ 去 AI 味优化 ➔ AI 配图 ➔ 公众号原生样式排版与 HTML 确定性校验 ➔ 自动推送公众号草稿箱。
- 💡 **无需 Key 零门槛演示闭环**：无需配置任何 API Key 即可启动完整演示流程（使用内置选题、文章及本地占位封面图），方便快速体验与产品交互验收。
- ⚡ **灵活的多模型引擎支持**：
  - **ChatGPT 会员模式（推荐）**：使用官方 Codex CLI（`Sign in with ChatGPT`），不消耗 OpenAI API Key，不读取浏览器 Cookie。
  - **OpenAI API 模式**：通过标准 OpenAI Key 驱动文本与图片生成。
  - **DeepSeek 文案 + ChatGPT 配图模式**：由 DeepSeek 生成高质量文本，结合 ChatGPT 生成视觉图层。
- ✍️ **Humanizer-zh 去 AI 味二次编辑**：集成 `Humanizer-zh`，保留事实边界，输出包含直接性、节奏、信任度、真实性、精炼度 5 维度的自然度评分报告。
- 🎨 **6 套精美公众号排版主题**：内置摸鱼绿、红白色系、石墨极简风、留白禅意风、摸鱼票据风、橄榄手记 6 套风格，排版自动适配内联样式与 `<span leaf="">` 兼容标记。
- 🛡️ **严格的 HTML 静态校验**：写入微信前调用静态校验脚本（`validate_gzh_html.py`）严格检查，杜绝格式错乱或非法标签提交草稿箱。
- ⏰ **内置定时任务机制**：支持设置每日固定时间自动运行流水线。
- ✏️ **草稿可编辑再推送**：本地预览后可在 Web 界面直接修改标题、摘要与正文 HTML，确认无误再一键写入公众号草稿箱；已写入公众号的草稿保护不可改。
- 🖼️ **正文按 section 独立配图**：除封面外，AI 会为每个小节自动生成独立插图，构建"封面 + 多图"的丰富版面，避免正文中只有一张重复封面图。
- 📑 **多栏目轻量支持**：内置栏目管理，可为不同栏目（公众号矩阵 / 主题刊物）独立配置主题、受众、语调与公众号凭据，一键切换即换"刊物风格"。
- ✦ **推文范文仿写模式 (Style Imitation)**：支持粘贴参考公众号爆款推文正文，Agent 深入提炼其开篇 hook、叙事套路、小节推进逻辑与句式节奏，结合最新信号或指定选题模仿生成新文章并送入草稿箱；也可在栏目设置中绑定默认风格范文。

---

## 🚀 快速开始

### 1. 克隆与安装

```bash
git clone https://github.com/lukaizj/moli-wechat-agent.git
cd moli-wechat-agent
npm install
```

### 2. 配置文件

复制环境变量模版文件 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

### 3. 启动本地服务

```bash
npm start
```
启动后在浏览器打开 <http://localhost:3210> 即可访问 Web 管理界面。
*(注：服务默认仅监听 `127.0.0.1`，确保安全)*

---

## ⚙️ 核心配置模式说明

### 模式 A：ChatGPT 会员模式（推荐）

通过官方 Codex CLI 授权使用当前的 ChatGPT 会员额度：

```bash
# 检查登录状态
npm run check:chatgpt
# 若未登录可运行
npm run login:chatgpt
```

配置 `.env`：
```dotenv
AI_PROVIDER=codex
CODEX_PATH=codex
CODEX_MODEL=gpt-5.4
```

### 模式 B：OpenAI API 模式

配置 `.env`：
```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_TEXT_MODEL=gpt-5.6-terra
OPENAI_IMAGE_MODEL=gpt-image-2

WECHAT_APP_ID=wx...
WECHAT_APP_SECRET=...
```

### 模式 C：DeepSeek 文案 + ChatGPT 配图模式

配置 `.env`：
```dotenv
AI_PROVIDER=deepseek
IMAGE_PROVIDER=codex
DEEPSEEK_API_KEY=sk-your-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash

CODEX_PATH=codex
CODEX_MODEL=gpt-5.4
```

---

## ✦ 推文范文仿写与自动推送 (Style Imitation Mode)

**墨流** 支持根据用户上传/粘贴的其他公众号爆款推文，由 Agent 深度分析其文风与套路进行**模仿创作并自动写入草稿箱**。

### 1. 即时模仿生成（Web 控制台）
1. 打开 Web 管理界面（`http://localhost:3210`），点击控制台上的 **「✦ 模仿推文生成」** 按钮；
2. 粘贴想要 Agent 模仿的参考公众号推文正文；
3. *(可选)* 输入指定新选题或切入角度。若留空，Agent 会自动搜集最近 7 天联网有效信号提炼选题；
4. 点击 **「开始模仿生成并送草稿箱」**，Agent 将深度提炼范文的开篇 hook 钩子、小节推进逻辑、句式节奏与金句总结，生成新文章并自动完成配图、排版与草稿推送。

### 2. 绑定默认风格范文（栏目与定时任务）
- **全局默认范文**：在「公众号设定」界面中配置“默认风格参考推文”，每日定时自动运行任务将默认继承此范文文风。
- **栏目独立范文**：在「栏目管理」中可为不同栏目独立设置“风格参考推文”，使不同公众号刊物拥有专属的爆款参考样本。

---

## 📱 微信公众号对接步骤

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)，在「设置与开发 → 基本配置」中获取 **AppID** 和 **AppSecret**；
2. 将运行本服务的服务器出口 IP 添加至公众号 **IP 白名单**；
3. 确保公众号账号具备**素材管理**与**草稿箱**接口权限；
4. 填写 `.env` 中的 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET` 并重启服务；
5. 流水线执行成功后，前往微信公众平台草稿箱进行人工预览并发布。

---

## 📂 项目结构说明

```
.
├── src/                    # 核心服务端与 Agent 业务逻辑
│   ├── server.js           # Express API 服务入口
│   ├── pipeline.js         # 全流程流水线控制器 (研究->写作->排版->推送)
│   ├── ai.js               # AI 模型统一调用适配层
│   ├── codex.js            # Codex CLI 集成模块
│   ├── deepseek.js         # DeepSeek API 集成模块
│   ├── humanizer.js        # Humanizer-zh 润色与去 AI 味逻辑
│   ├── gzh.js              # 微信排版与 HTML 校验逻辑
│   └── wechat.js           # 微信公众平台 API 调用封装
├── public/                 # 前端 Web 管理界面 (HTML/CSS/JS)
├── vendor/                 # 依赖的第三方技能与组件
│   ├── gzh-design-skill/   # 公众号排版主题与 HTML 校验工具 (AGPL-3.0)
│   └── Humanizer-zh/       # 中文去 AI 味润色规则库 (MIT)
├── data/                   # 本地数据存储与运行生成目录
│   └── state.json          # 状态与配置持久化文件
├── test/                   # Node.js 单元测试集
├── .env.example            # 环境变量配置示例
├── package.json            # 项目依赖与脚本配置
└── LICENSE                 # 开源许可协议 (AGPL-3.0)
```

---

## 🧪 单元测试

运行完整的端到端与单元测试集：

```bash
npm test
```

---

## 📊 运行状态可观测性

- 内置结构化 JSON 日志（`LOG_LEVEL` 控制，默认 `info`），服务端错误统一走日志输出，便于排查。
- 每次运行的每个步骤（研究 / 写作 / 配图 / 排版）均记录 `startedAt / completedAt / durationMs`，并在 run 级别汇总总耗时，方便定位瓶颈与优化。

---

## 📄 许可证与第三方致谢

- 本项目综合源码采用 **AGPL-3.0-or-later** 开源协议发布。
- `vendor/gzh-design-skill` 遵循 **AGPL-3.0-or-later** 协议 (原作者: [isjiamu](https://github.com/isjiamu/gzh-design-skill))。
- `vendor/Humanizer-zh` 遵循 **MIT** 协议 (原作者: [op7418](https://github.com/op7418/Humanizer-zh))。
- 完整第三方声明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) 与 [`vendor/VENDORED.md`](vendor/VENDORED.md)。
