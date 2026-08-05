# 墨流：微信公众号内容 Agent

从一个长期主题出发，自动完成：

1. 联网研究最近 7 天的有效信号并自主选题；
2. 按公众号定位完成中文成稿与内联样式排版；
3. 生成封面／正文图并上传微信素材；
4. 调用微信公众号草稿接口写入草稿箱；
5. 停在人工审核前，由运营者到公众号后台一键审核发布。

没有密钥也能跑完整的**演示流程**，生成内置选题、文章和本地封面，方便先验收产品交互。

## 启动

```bash
cd /Users/qcc/moli-wechat-agent
cp .env.example .env
npm install
npm run login:chatgpt
npm start
```

访问 <http://localhost:3210>。

服务默认只监听 `127.0.0.1`，避免局域网中的其他设备触发会员内容引擎或公众号写入操作。

## 接入正式能力

### ChatGPT 会员模式（推荐）

本模式通过官方 Codex CLI 的“Sign in with ChatGPT”使用当前 ChatGPT 方案，不读取浏览器 Cookie，也不消耗 `OPENAI_API_KEY`。先确认登录：

```bash
npm run check:chatgpt
```

`.env` 使用：

```dotenv
AI_PROVIDER=codex
CODEX_PATH=codex
CODEX_MODEL=gpt-5.4
```

选题、成稿和配图都会通过本机会员登录执行；可用量受当前 ChatGPT 方案的 Codex 使用限制约束。

### OpenAI API 模式（备选）

把 `.env` 改为：

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_TEXT_MODEL=gpt-5.6-terra
OPENAI_IMAGE_MODEL=gpt-image-2

WECHAT_APP_ID=wx...
WECHAT_APP_SECRET=...
```

然后重启服务。前端只显示接入状态，不读取或保存密钥。

### 微信侧准备

- 在公众平台「设置与开发 → 基本配置」获取 AppID 与 AppSecret；
- 把运行本服务的服务器出口 IP 加到公众号 IP 白名单；
- 确认公众号具备素材管理与草稿箱接口权限；
- 正文图片会先调用 `media/uploadimg`，封面会先调用 `material/add_material`，最后调用 `draft/add`；
- 草稿成功后，到 <https://mp.weixin.qq.com/> 审核并发布。

## 定时运行

在“公众号设定”里打开定时生成并选择时间。服务进程需持续运行。时区默认 `Asia/Shanghai`，可以在 `data/state.json` 中调整 `settings.timezone`。

## 数据与运行

- 设定、运行日志与草稿索引：`data/state.json`
- 生成图片：`data/generated/`
- 健康检查：`GET /api/health`
- 手动启动：`POST /api/runs`

## 测试

```bash
npm test
```

测试覆盖文章清洗与图片占位、状态持久化、微信草稿请求结构和无密钥演示闭环。
