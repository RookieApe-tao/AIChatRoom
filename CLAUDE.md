# CLAUDE.md

本文件为 AI 编码助手（Claude Code 等）提供本项目的上下文说明。

## 项目概述

**AI 多角色对话实验室**：一个纯前端的「多个 AI 互相聊天」的实验页面。若干 AI 按顺序发言形成多轮对话，人类可随时插话；每个 AI 拥有独立的长期记忆文件，由各自的模型后台整理更新。

- 无构建步骤、无框架、无 package.json —— 原生 HTML/CSS/JS，直接改直接用
- 样式用本地 `layui/`（仅取 layui.css 与字体，离线可用），少量 layui 按钮/输入框 class
- 调用大模型走 **OpenAI 兼容接口**（`POST {base}/chat/completions`），支持 SSE 流式

## 运行方式

```bash
node server.js        # 本地静态服务器，访问 http://127.0.0.1:8765
# 或双击 start-server.bat（会先杀掉占用 8765 端口的旧实例）
```

- 直接 `file://` 双击 index.html 在 Chrome/Edge 中也可用（依赖「文件系统访问 API」读写本地 txt）
- 其他浏览器自动降级：数据暂存浏览器 localStorage，靠手动导入/导出同步
- 无测试、无 lint，验证方式就是启动后手动操作页面

## 架构（js/ 按依赖顺序以普通 `<script>` 加载）

⚠ 刻意不用 ES modules（保证 `file://` 双击可用），所有模块共享全局作用域，**函数与 `state` 跨文件直接调用，改动一个文件可能影响其他文件**。

| 文件 | 职责 |
|---|---|
| `js/01-state.js` | 常量、全局 `state`、通用工具（`$`、`escH`、`toast` 等）、内置默认配置 `DEF_CFG` |
| `js/02-config.js` | 配置读写：localStorage 降级 + config.txt 序列化/解析 |
| `js/03-chatlog.js` | 聊天记录解析 / 序列化 / 发言顺序预测 |
| `js/04-api.js` | 大模型调用 `callLLM()`（自动重试：瞬时故障重试 3 次，鉴权/参数错误不重试）、流式读取、`sanitize()` 清洗模型输出 |
| `js/05-render.js` | 所有界面渲染 |
| `js/06-actions.js` | 发言流程、记忆整理、人设优化、AI 增删 |
| `js/07-main.js` | 主流程、本地文件读写（File System Access API）、事件绑定、初始化 |

## 数据文件（均与 index.html 同目录）

- `config.txt` —— 全部配置，INI 风格：`[AI1] [AI2]…` 各 AI 分节 + `[API]` 连接池（`名称 = 地址|Key|默认模型`）+ `[全局]`。页面改动自动写回；手动编辑保存后需点页面「⟳ 重载配置」生效
- `chat_log.txt` —— 所有 AI 共用的聊天记录，程序按 `### [ID] 时间` 分段解析后作为上下文发给模型
- `memory_aiN.txt` —— 每个 AI 一个长期记忆文件（AI1→`memory_ai1.txt`）
- `剧本-玻璃茧.txt`、`场景预设合集.txt` —— 人工维护的剧本/场景素材
- 后三个运行时文件（`chat_log.txt`、`memory_ai*.txt`）已加入 `.gitignore`，勿提交

## ⚠ 安全红线：API Key

- 仓库中提交的 `config.txt` 与 `js/01-state.js`（`DEF_CFG` 默认值）里的 key 一律是**占位符**（如 `sk-your-api-key-here`、`your-zhipu-api-key-here`）
- 真实 key 只在本地使用：运行时填入 `config.txt` 或页面配置面板，**严禁提交/推送真实 key**。提交前若 git status 显示 `config.txt` 或 `js/01-state.js` 有改动，先 diff 确认没有带入真实 key

## 代码约定

- 注释、UI 文案、变量命名注释均为中文；每个 js 文件第一行注明职责
- 字符串拼接风格（模板字符串与 `+` 混用），无分号省略；保持现有风格即可
- 改配置格式需同时改：`02-config.js`（序列化/解析）、`01-state.js` 的 `DEF_CFG`、以及 `index.html` 使用说明
