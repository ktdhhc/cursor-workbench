# Cursor Workbench

本地运行的全栈 Web AI 编程工作台：真实 Code-OSS 编辑器 + 独立 Agents Window，使用 OpenAI-compatible 模型接口。

## 启动

Windows 需 WSL2 Ubuntu；Linux 需 x64、Node 22+、Git、tar。此机器已使用 WSL Node 24。

```sh
npm run setup
# 编辑 .env，设置 AI_API_KEY
npm run launch
```

打开 **http://127.0.0.1:4317**。第一次 setup 会克隆 Microsoft VS Code 并下载官方 code-server Linux x64 包（约 220 MB）。运行数据、密钥、依赖及下载的上游代码均被 Git 忽略。

此机器的实际运行模式：React 生产构建与 Express 服务运行在 WSL；Code-OSS 通过同源 `/editor/` 路由代理。`npm run launch` 会先构建前端，保留已有 code-server，并拒绝接管其他应用占用的端口。Ctrl+C 仅停止本次启动器创建的进程。

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

可设置 `WORKSPACE_ROOT` 指向一个 **WSL/Linux 绝对路径**。Windows 项目可使用 `/mnt/c/...`。默认是自带的 `workspace` 示例项目。不要把整个用户主目录作为工作区。

## 开发与验证

```sh
npm test
npm run build
node scripts/smoke-live.mjs chat
node scripts/smoke-live.mjs parallel
node scripts/smoke-live.mjs tools
```

`smoke-live` 使用真实已配置模型，会产生少量接口调用；`tools` 创建或修改 `workspace/src/agent-verification.js`（在 42/43 两个验证值间切换），并仅自动批准精确匹配的 `node --test`。它只适用于本项目自带的验证工作区，不要对不熟悉的项目直接运行。普通用户命令没有自动批准。

前端开发：WSL 中 `npm run dev`（4319，API与编辑器代理到4317）；服务端 `npm start`，编辑器 `bash scripts/code-server.sh`。生产单入口使用 `npm run launch`。

## 安全边界

- 仅监听 loopback，校验 Host/Origin，拒绝跨站 API 请求；扩展桥接使用本机随机 token。
- 文件工具限定工作区，拒绝路径穿越、符号/硬链接、常见凭据路径、二进制和超过 128KB 的文件；并发写入使用内容 hash 冲突检查。
- **终端不是安全沙箱。** 获批 shell 命令在当前 WSL 用户权限下执行，可访问该用户本来能访问的系统文件；只批准可信命令。模型内容和仓库提示词不能替代审批。
- 命令有超时、输出上限、取消及子进程清理；环境会移除密钥类变量。请勿对外网公开此单用户服务。
- 对话和 before/after 保存在 `.state/agents`；是本地开发记录，不是加密密钥库。

## 开源基础与范围

Microsoft VS Code 源码真实克隆于 `vendor/vscode`。运行编辑器使用 code-server 官方预编译 Code-OSS，而非宣称本机编译全部 VS Code。固定版本和 commit 在 `UPSTREAM.json`。新增代码包括 Node 扩展、全栈 Agent 引擎与双模式 Web shell。

这是 Cursor **核心体验**实现，不含专有模型、云端 VM、PR 托管、多人租户、计费或 Cursor 商业服务。Firecrawl 未配置，调研使用官方公开资料替代；Context7 实际检索结果保留在 `docs/research`。

阶段性截图、真实模型验证和需求审计见 `docs/evidence/`。最终 WSL Node24 验证为 32 项测试通过、生产构建成功；冷启动、真实 DeepSeek 并发任务、浏览器文件保存/变更还原和双窗口切换都有独立证据。完整需求映射见 `docs/evidence/REQUIREMENTS-AUDIT.md`，视觉审阅的实际结论与流程差异见 `docs/evidence/FINAL-REVIEW.md`。
