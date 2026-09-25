# Stage 6 — light theme and UI language gate

Date: 2026-09-25.

## Implementation
- **Theme**: every hardcoded color (~130 values across styles.css/workspace.css) was consolidated into ~60 semantic tokens; `:root` keeps the shipped dark values and `:root[data-theme='light']` overrides the full set (sage `#55663c` on warm paper, retinted diff red/green, light scrollbars/selection/shadows). Toggle button (sun/moon) in the title bar; persists in localStorage; first visit follows `prefers-color-scheme`. The embedded Code-OSS pane keeps its own VS Code theme by design (noted in the toggle tooltip).
- **Language**: `client/i18n.jsx` provides an en/zh dictionary, a `{placeholder}` interpolator, and an `I18nProvider`; every component (App, Sidebar, Conversation, Composer, Artifacts, Activity, Markdown, boundary fallback, api.js network errors) renders through `t()`. Defaults to `navigator.language`, persists in localStorage, and updates `document.title`/`html lang`. Language button (中/EN) beside the theme toggle.
- status/composer/status-bar labels, approval card, diff toolbar (差异/修改前/修改后/完整文件), activity captions (`已完成: node --test`), relative times (分钟前/小时前), and toasts are all localized.

## Defect found by browser verification (and fixed)
The first dark-English screenshot showed Chinese relative times ("42 分钟前") while headings were English. Root cause: the script that inserted the new time keys matched the second anchor inside the **en** dictionary, so zh time entries shadowed en values (duplicate keys, last-wins), and the zh dictionary was missing them entirely (falling back to the overwritten en entries). Keys were relocated to their proper dictionaries; switching now updates heading, buttons and relative times in sync.

## Verification (screenshots in docs/evidence)
- `06-dark-zh.png` — dark + 中文: full shell (新建 Agent、搜索任务、想做点什么？、变更/活动、已完成: node --test)。
- `06-light-zh.png` — light + 中文: same content on the light palette.
- `06-light-en.png` — light + English: times as "55m ago", buttons "New agent" etc.
- `06-light-zh-diff.png` — light diff review: retinted red/green lines, 还原/接受 controls legible.
- `06-editor-zh-titlebar.png` — localized titlebar over the genuine editor pane.
- Theme toggle switches instantly without reload (data-theme attribute); language toggle updates in place.
- `npm test`: **37 passed, 0 failed** (includes i18n dictionary assertions for both languages and light-theme token checks); production build succeeded.
