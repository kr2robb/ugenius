# 优竞 Ugenius（game-assistant）

Dopame OS 原创应用 —— 竞技游戏智能助手（先做《无畏契约》赛后复盘）。

> 代码仓库：https://github.com/kr2robb/ugenius
> 提交文档：`项目说明.md` ｜ 路演 PPT：`优竞Ugenius-路演PPT.pptx`
> 产品构想与决策记录在桌面 `C:\Users\24996\Desktop\README.md`，本文件只讲技术。

## 技术栈

- **Vite 8** + 原生 JS（无框架）
- **`@dopame/acde-api` v0.0.9**（Dopame OS SDK）
- **backend**：`server.js`（acde 后端，Cloudflare Workers 风格）代理 AI —— 通义千问 qwen3.8-flash 视频分析

## 结构

```
项目说明.md          # 提交用项目说明（定位 / 功能 / 架构 / 系统能力 / 链路）
优竞Ugenius-路演PPT.pptx  # 13 页路演 PPT（暗黑红金主题）
.env.example        # AI Key 示例（实际 .env 不提交）
acde.config.jsonc   # acde 应用配置（type:app / icon:game / capabilities.fs）
server.js           # 后端 AI 代理：DashScope 上传视频 → Qwen 视频分析（/api/analyze、/api/health）
index.html          # 入口页面
vite.config.js      # Vite + acde() 插件（处理 acde:* 模块）
public/
  logo-wordmark.png      # 品牌字标（优竞 Ugenius，透明 PNG，顶栏/首页用）
  logo-wordmark-gold.png # 金色版字标（首页 hover 流光用）
  logo.jpg               # 字标源图（1280×1280）
src/
  main.js           # 界面逻辑（复盘 / 社区 / 组队，视频选择 + AI 复盘调用）
  style.css         # 暗色主题（无畏契约红黑）
```

## 命令

- `npm run dev` —— 本地开发（Vite 热更新）
- `npm run dev:backend` —— 本地 AI 代理（读取项目根目录 `.env` 的 `QWEN_API_KEY`）
- `npm run build` —— 构建
- `acde check` —— 校验 acde 配置与能力声明
- `acde build` —— 打包为 Dopame OS 可加载的 `.acde/`
- `acde dev` —— acdert 真机调试（需先在宿主环境设置 `QWEN_API_KEY`）

## 环境变量

```bash
cp .env.example .env      # 填入 DashScope API Key
npm run dev:backend       # 自动加载 .env
```

`.env` 已被 `.gitignore` 排除，不会进入版本库。acdert 真机运行时，需在启动 `acde dev` 前把 `QWEN_API_KEY` 设置到宿主环境。

## 系统能力（acde:* 模块）

通过 `import fs from 'acde:fs'` 调用；开发环境是 stub，运行在 Dopame OS 时是真实现。

| 模块 | 能力 |
|------|------|
| `acde:fs` | 文件读写（替代 IndexedDB，做本地存储）|
| `acde:window` | 窗口（标题 / 菜单 / 关闭 / 最小化）|
| `acde:network` | 网络状态（WiFi 管理，非 HTTP）|
| `acde:open` | 打开文件 / 链接 |

**AI 没有 `acde:ai` 模块**——走系统提供的 OpenAI 兼容 HTTP 接口，用标准 `fetch` 调用。

## 数据链路

```
POV 视频(录屏/无畏时刻) → binary 直传 backend → DashScope 内置上传(oss:// URL) → Qwen 视频分析 → 复盘建议 JSON
```

> 视频链路已跑通（本机实测）；开赛后换成 Dopame OS 系统 AI 接口。结构化数据（掌瓦/官方 API）尚未接入。
