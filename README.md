# Cursor Workbench

本地运行的全栈 Web AI 编程工作台：真实 Code-OSS 编辑器 + 独立 Agents Window，使用 OpenAI-compatible 模型接口。

## 启动

按你的环境三选一。所有模式只需 Node 22+（Windows 上装原生 Node 即可）；编辑器模式另需 Git 和 tar。

### Windows，没有 WSL（开箱即用，Agents 模式）

```sh
npm install
copy .env.example .env   # 编辑 .env，设置 AI_API_KEY
npm start
```

打开 **http://127.0.0.1:4317**。Agent 对话、读改文件、终端审批、并行任务、变更审阅全部可用；Editor 按钮会显示启用指引。`npm run doctor` 可随时检查环境。

### Windows + WSL2 Ubuntu（完整体验，含真实编辑器）

```sh
npm run setup   # 自动进入 WSL：克隆 VS Code 源码、下载 code-server、装依赖
# 编辑 .env，设置 AI_API_KEY
npm run launch  # 构建 + 启动编辑器(4318) + 启动服务(4317)
```

`setup`/`launch` 会自动选择 WSL 发行版和其中的 Node ≥22；可用 `CURSOR_WORKBENCH_WSL_DISTRO` 指定发行版，`CURSOR_WORKBENCH_NATIVE=1` 强制走 Windows 原生（Agents-only）模式。

### Linux / macOS

```sh
npm run setup   # 含编辑器运行时；macOS 为官方 darwin 包，未在本机验证
# 编辑 .env，设置 AI_API_KEY
npm run launch
```

打开 **http://127.0.0.1:4317**。首次 setup 会克隆 Microsoft VS Code 并下载官方 code-server 包（约 220 MB）。运行数据、密钥、依赖及下载的上游代码均被 Git 忽略。

`npm run launch` 会先构建前端，保留已有 code-server，并拒绝接管其他应用占用的端口。Ctrl+C 仅停止本次启动器创建的进程。

### Enable the editor without WSL

在纯 Windows 上获得真实编辑器需要一次本地源码构建（一次性，之后直接复用）：

1. 前置：VS 2022 Build Tools（含 "Desktop development with C++"）加入 PATH、Python 3、Node 22+。首次编译内存峰值较大（构建脚本默认 8GB Node 堆），建议关闭占内存的程序。
2. `cd vendor/vscode && npm install`
3. `scripts\code-server.bat`（微软官方脚本：自动编译并启动服务）
4. 以 `EDITOR_ENABLED=1` 启动本项目服务（写入 `.env` 或设环境变量），打开 http://127.0.0.1:4317 即可。

不改任何 VS Code 源码；构建产物在 `vendor/vscode/out/`，日常启动不再重新编译。

## 使用

- **Editor Window**：VS Code 原生文件树、标签页、语法高亮、手动编辑/保存与终端。
- **Agents Window**：新建 Agent 或 Ask 任务；最多 4 个同时进行。每个任务有独立对话、工具活动和变更记录。
- **Agent**：能列目录、搜索、读文件、创建/修改文件。终端命令会暂停并展示明确审批，批准后才执行。
- **Ask**：只读分析，不提供写文件或命令执行工具。
- **Changes**：查看 before/after，保留或还原变更。外部编辑产生冲突时拒绝静默覆盖。
- **Open in editor**：通过真实 VS Code 扩展打开文件；切换窗口不会卸载编辑器，保留标签和未保存编辑。
- **Stop**：取消模型请求、待审批命令或正在运行的命令。

## 配置

`.env.example` 说明所有配置。默认模型 `deepseek-flash`，接口 `https://api.deepseek.com/v1`。Key 只在服务端读取，不返回浏览器、不进入前端构建。

可设置 `WORKSPACE_ROOT` 指向一个项目目录。WSL/Linux 路径如 `/mnt/c/...` 或 `/home/...`；Windows 原生模式直接用 `C:\path\to\project`。默认是自带的 `workspace` 示例项目。不要把整个用户主目录作为工作区。

编辑器默认关闭、按需启用（`EDITOR_ENABLED` 由 `npm run launch` 自动设置）：纯 `npm start` 即 Agents-only 模式，任何平台一致。

## 开发与验证

```sh
npm test
npm run build
node scripts/smoke-live.mjs chat
node scripts/smoke-live.mjs parallel
node scripts/smoke-live.mjs tools
```

`smoke-live` 使用真实已配置模型，会产生少量接口调用；`tools` 创建或修改 `workspace/src/agent-verification.js`（在 42/43 两个验证值间切换），并仅自动批准精确匹配的 `node --test`。它只适用于本项目自带的验证工作区，不要对不熟悉的项目直接运行。普通用户命令没有自动批准。

前端开发：`npm run dev`（4319，API与编辑器代理到4317）；服务端 `npm start`（Agents-only，开发编辑器时在 `.env` 设 `EDITOR_ENABLED=1` 并另启 `bash scripts/code-server.sh`）。生产单入口使用 `npm run launch`。环境自检用 `npm run doctor`。

## 安全边界

- 仅监听 loopback，校验 Host/Origin，拒绝跨站 API 请求；扩展桥接使用本机随机 token。
- 文件工具限定工作区，拒绝路径穿越、符号/硬链接、常见凭据路径、二进制和超过 128KB 的文件；并发写入使用内容 hash 冲突检查。
- **终端不是安全沙箱。** 获批 shell 命令在本机当前用户权限下执行（WSL 模式在 WSL 用户、Windows 原生模式在 Windows 用户），可访问该用户本来能访问的系统文件；只批准可信命令。模型内容和仓库提示词不能替代审批。
- 命令有超时、输出上限、取消及子进程清理；环境会移除密钥类变量。请勿对外网公开此单用户服务。
- 对话和 before/after 保存在 `.state/agents`；是本地开发记录，不是加密密钥库。

## 开源基础与范围

Microsoft VS Code 源码真实克隆于 `vendor/vscode`。运行编辑器使用 code-server 官方预编译 Code-OSS，而非宣称本机编译全部 VS Code。固定版本和 commit 在 `UPSTREAM.json`。新增代码包括 Node 扩展、全栈 Agent 引擎与双模式 Web shell。

这是 Cursor **核心体验**实现，不含专有模型、云端 VM、PR 托管、多人租户、计费或 Cursor 商业服务。Firecrawl 未配置，调研使用官方公开资料替代；Context7 实际检索结果保留在 `docs/research`。

阶段性截图、真实模型验证和需求审计见 `docs/evidence/`。最终 WSL Node24 验证为 32 项测试通过、生产构建成功；冷启动、真实 DeepSeek 并发任务、浏览器文件保存/变更还原和双窗口切换都有独立证据。完整需求映射见 `docs/evidence/REQUIREMENTS-AUDIT.md`，视觉审阅的实际结论与流程差异见 `docs/evidence/FINAL-REVIEW.md`。
