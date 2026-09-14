# 🤖 AI 多角色对话实验室（AIChatRoom）

一个纯前端的「多个 AI 互相聊天」实验页面：若干 AI 按顺序发言形成多轮对话，人类可随时插话；每个 AI 拥有独立的长期记忆，由各自的模型在后台自动整理更新。

无框架、无构建步骤 —— 原生 HTML/CSS/JS，下载即用。

## ✨ 功能特性

- 🗣️ **多 AI 圆桌对话**：最多 8 个 AI 参与发言，可自定义发言顺序、开场先发言者、轮数（支持无限轮）
- 👤 **人类插话**：对话进行中随时发消息插入，AI 们会依次回应你
- 🧠 **独立长期记忆**：每个 AI 一个记忆文件，每次发言后自动由模型整理更新
- 🎭 **自定义人设**：每个 AI 可单独设置人设、模型、温度、API 连接
- 📡 **流式输出**：支持 SSE 逐字实时显示（接口不支持时自动回退）
- 💭 **思考过程**：可展开查看 AI 的推理内容（GLM / MiMo / DeepSeek 等，仅展示不落盘）
- 🔌 **OpenAI 兼容接口**：任何兼容 `/chat/completions` 的服务都能接入，内置自动重试
- 📜 **场景剧本**：内置剧本与场景预设素材，也可自己编写
- 📁 **本地数据**：聊天记录、记忆、配置全部存本地 txt 文件，自己完全掌控

## 🚀 快速开始

### 方式一：直接打开（最简单）

用 **Chrome / Edge** 双击打开 `index.html`，点右上角「📁 连接目录」授权本文件夹，即可直接读写各 txt 文件。

### 方式二：本地服务器（推荐）

```bash
node server.js
# 浏览器访问 http://127.0.0.1:8765
```

或直接双击 `start-server.bat`（自动清理占用 8765 端口的旧实例）。

> 其他浏览器不支持本地文件读写，会自动降级为浏览器内暂存 + 手动导入/导出。

### 三步开聊

1. 展开顶部「⚙ 配置」，为每个 AI 填写 API 地址 / Key / 模型 / 人设（或在 `[API]` 里定义连接后下拉复用）
2. 填写「场景设定」，选择参与的 AI 与发言顺序
3. 点「▶ 开始聊天」；中途可在底部输入框插话，「▶ 继续」让 AI 们自行接着聊

## ⚙️ 配置说明

所有配置都在 `config.txt`（INI 风格），页面改动会自动写回；手动编辑保存后点页面「⟳ 重载配置」生效。

```ini
# ---- 某个 AI ----
[AI2]
name = 智谱
base = https://api.deepseek.com
key = sk-your-api-key-here          ; ← 填你自己的 Key
model = deepseek-flash
temp = 0.8
autoMem = 1                          ; 自动整理长期记忆
persona = 你是…（人设）

# ---- API 连接池（供各 AI 下拉复用：名称 = 地址|Key|默认模型）----
[API]
deepseek = https://api.deepseek.com|sk-your-api-key-here|deepseek-flash

# ---- 全局 ----
[全局]
rounds = 2                           ; 轮数，-1 = 无限
gap = 5                              ; 发言间隔（秒）
order = AI2, AI1                     ; 参与发言的 AI 与顺序
```

## 📂 文件结构

```
├── index.html          # 页面入口
├── server.js           # 本地静态服务器（Node，零依赖）
├── start-server.bat    # 一键启动（Windows）
├── config.txt          # 全部配置（AI 分节 + API 连接池 + 全局）
├── js/                 # 模块化脚本（按 01~07 顺序加载）
├── css/app.css         # 界面样式
├── layui/              # layui 样式库（本地离线）
├── chat_log.txt        # 聊天记录（运行时生成，已 gitignore）
├── memory_ai*.txt      # 各 AI 的长期记忆（运行时生成，已 gitignore）
├── 剧本-玻璃茧.txt      # 剧本素材
└── 场景预设合集.txt     # 场景预设素材
```

## 🔐 关于 API Key

> **本仓库中的所有 Key 均为占位符。** 使用前请把 `config.txt` 里的 `key` 换成你自己的；请勿把真实 Key 提交到公开仓库。

## 🛠️ 技术要点

- 刻意不用 ES modules 与打包工具，普通 `<script>` 按序加载，保证 `file://` 双击可用
- 本地文件读写基于 Chrome/Edge 的 **File System Access API**
- 大模型调用统一走 `POST {base}/chat/completions`，瞬时故障自动重试 3 次（鉴权/参数错误不重试）
- 聊天记录按 `### [ID] 时间` 分段解析后作为上下文发给模型
