---
name: Cursor Workbench
description: A dense local development workbench pairing agent conversations with the genuine Code-OSS editor.
colors:
  primary: "#bdcbb2"
  primary-ink: "#21291d"
  sidebar: "#161718"
  canvas: "#191a1b"
  artifacts: "#181a19"
  control: "#242628"
  hover: "#2b2d2e"
  text: "#e4e4e2"
  secondary: "#9da09e"
  subtle: "#8e928f"
  divider: "#303233"
  warning: "#d7bd8e"
  error: "#e6aaa4"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "13px"
    fontWeight: 400
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "12px"
    fontWeight: 500
  action:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "12px"
    fontWeight: 400
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "11px"
    fontWeight: 400
  metadata:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "10px"
    fontWeight: 400
  transcript:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.75
  composer:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  code:
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.65
  button:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  button-small:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
  editor-code:
    fontSize: "14px"
    lineHeight: "22px"
rounded:
  badge: "3px"
  compact: "4px"
  accessory: "5px"
  control: "6px"
spacing:
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "14": "14px"
  "16": "16px"
  "28": "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  button-primary-hover:
    backgroundColor: "#ced9c5"
  button-secondary:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
  button-secondary-hover:
    backgroundColor: "#2e3130"
  button-small:
    backgroundColor: "#232525"
    textColor: "{colors.secondary}"
    typography: "{typography.button-small}"
    rounded: "{rounded.compact}"
    padding: "4px 7px"
  button-small-hover:
    backgroundColor: "#303330"
    textColor: "{colors.text}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "4px 6px"
  button-text-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.text}"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    rounded: "{rounded.control}"
    padding: "0"
    width: "28px"
    height: "28px"
  button-icon-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.text}"
  button-send:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.accessory}"
    padding: "0"
    width: "29px"
    height: "28px"
  input-task-search:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "0 7px"
    height: "33px"
  composer:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text}"
    typography: "{typography.composer}"
    rounded: "{rounded.control}"
  window-switcher:
    backgroundColor: "#111313"
    rounded: "{rounded.control}"
    padding: "3px"
  window-mode:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    typography: "{typography.action}"
    rounded: "{rounded.compact}"
    padding: "4px 11px"
  window-mode-selected:
    backgroundColor: "#2b2e2c"
    textColor: "#edf0e9"
  running-task-count:
    backgroundColor: "#40473c"
    textColor: "#dbe5d3"
    typography: "{typography.metadata}"
    rounded: "{rounded.badge}"
    padding: "0 4px"
  task-selected:
    backgroundColor: "#292c28"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 10px"
  status-completed:
    textColor: "{colors.primary}"
    typography: "{typography.label}"
  message-user-card:
    backgroundColor: "#232622"
    textColor: "#e5e8e1"
    typography: "{typography.transcript}"
    rounded: "{rounded.control}"
    padding: "13px 16px"
  approval-card:
    backgroundColor: "#28251f"
    rounded: "{rounded.control}"
    padding: "17px"
  code-block:
    backgroundColor: "#151716"
    typography: "{typography.code}"
    rounded: "{rounded.control}"
  artifacts-panel:
    backgroundColor: "{colors.artifacts}"
    width: "340px"
---

# Design System: Cursor Workbench

## Overview

**Creative North Star: "Task-oriented development cockpit"**

This is the brief-pinned, no-roll Operate world already built: a quiet, dense developer workbench, not a marketing page or a new identity proposal. Charcoal regions, small controls, readable conversations, and restrained sage emphasis keep attention on tasks, commands, and files. The visible shell says Workbench; this independent implementation must not imply affiliation with Cursor.

The React shell and the genuine Code-OSS workbench are complementary renderers. Agents use a task rail, transcript/composer, and Changes/Activity panel. Editor mode gives the body to a persistent code-server iframe rather than reconstructing an editor from decorative components. Shared background overrides connect the two; native editor syntax colors, icons, tabs, and interaction styling remain owned by Code-OSS.

This record is extracted from `client/styles.css`, its earlier `client/workspace.css` import, representative React components, and `scripts/editor-settings.json`; `scripts/setup.mjs` seeds those editor settings only when the runtime settings file is absent. `PRODUCT.md` and the Direction contract in `docs/IMPLEMENTATION.md` supply the already-confirmed world, not replacement values. The main agent supplied refreshed final desktop, mobile, and editor captures in `.impeccable/review/`, together with computed-style evidence for the current command-status caption and fully opaque response-copy control. This documentation pass did not run a browser; source remains authoritative. Tokens describe durable source rules; component-local literals remain local rather than becoming an invented global scale.

**Key Characteristics:**
- Dense, full-height operation with independently scrolling work regions.
- Neutral dark surfaces, quiet dividers, and sage focus/action emphasis.
- UI sans for controls and prose; monospace for source and tool payloads.
- Real editor continuity and explicit task, approval, error, and review states.
- Lucide vector interface assets, with no shipping raster imagery in the React shell.

## Colors

The warm-charcoal brief lands as nearly neutral dark grays with olive-tinted selections and muted semantic state colors, not a saturated brand palette.

### Primary

- **Sage action** (`primary`): decisive action fills, keyboard outlines, links, active artifact underlines, and working/completed task indicators.
- **Deep olive ink** (`primary-ink`): text and SVG strokes on the light sage action fill, not body text on the dark canvas.

### Secondary

These are semantic signals, not additional brand accents.

- **Approval amber** (`warning`): waiting-for-approval status. Approval containers and command previews use their own related, source-defined amber/brown treatments.
- **Failure salmon** (`error`): task errors, error notices, and clipboard failure feedback. Diff removals use their own local red/brown row treatment rather than inheriting the alert color wholesale.

### Neutral

- **Rail charcoal** (`sidebar`): titlebar and task sidebar; also the configured native editor rail, tab-strip, and status-bar backgrounds.
- **Working charcoal** (`canvas`): conversation canvas and configured native editor background/active tab.
- **Artifact charcoal** (`artifacts`): the Changes/Activity pane; this is a literal extracted from the workspace stylesheet, not a root custom property.
- **Raised control** (`control`): composer and secondary actions.
- **Hover gray** (`hover`): shared text/icon action hover surfaces; individual navigation patterns have their own source-defined hover values.
- **Main ink** (`text`), **secondary ink** (`secondary`), and **subtle ink** (`subtle`): principal text, supporting text/placeholders, and metadata respectively. They are text-role names, not brand accent tiers.
- **Quiet divider** (`divider`): the one-pixel structural lines between rails, headers, and content regions.

Frontmatter values retain the source hex notation. The sidecar's eight-step OKLCH strips are derived panel-preview metadata required by the document format, not colors shipped by the app or an authorized palette extension. No synthesized tone becomes a UI token.

### Named Rules

**The Scoped Sage Rule.** Sage belongs to shell focus, decisive actions, links, and positive task state; it does not replace the native editor's syntax palette or its own interaction accents.

**The Explicit State Rule.** Pair task state with a label or accessible label and a distinct vector icon; diff additions and removals also retain their signs, rather than communicating through color alone.

## Typography

**Body/UI Font:** the platform UI stack recorded in `typography.body`, including the explicit Microsoft YaHei fallback for Chinese text.

**Code Font:** the shell's monospace stack recorded in `typography.code`. The native editor's font family is not set by this project; do not claim that it inherits the shell stack.

**Character:** compact application typography, not a display-led brand system. The scale is role-driven rather than a mathematical ratio. Default UI line-height is left to the font/browser where the source does not specify it.

### Hierarchy

- **Body:** inherited shell text, with the `body` token as its base.
- **Title / action:** compact conversation and empty-panel titles use `title`; mode labels, task names, search text, and ordinary text actions use `action`.
- **Label / metadata:** `label` serves status and model information; `metadata` serves supporting times and counts. These are not alternatives to readable body copy.
- **Transcript / composer:** long-form output uses `transcript`; input uses `composer`. Transcript and composer containers share a maximum width (760px), not a fixed character measure. On narrow phones the composer becomes smaller (13px at widths up to 480px); transcript prose remains unchanged.
- **Code:** fenced message code uses `code`; inline code is relative to surrounding prose (.88em). Compact diff and activity payload renderers have local sizing rather than setting the general code-reading standard.
- **Editor code:** only the explicit editor size and line-height are captured by `editor-code`; native UI and syntax typography remain upstream-owned.
- **Response headings:** generated Markdown uses a local heading sequence (21px / 18px / 16px / 14px, weight 550, line-height 1.4), not a marketing hierarchy or an application display ramp.

There is deliberately no display token. The welcome prompt's system-font heading is observed implementation, not a reusable display-face decision; see the not-canonized line below.

### Named Rules

**The Two Text Channels Rule.** Use the platform UI stack for shell labels and conversation prose, and the monospace stack for source code, command previews, and structured tool output; filenames in navigation remain UI text.

## Layout

- **Frame:** a viewport-height flex shell (100dvh), with no document-level scrolling and a minimum body width (320px). The shared bar is fixed in the flex layout (48px). Global notices occupy space below it when present, so editor content is not guaranteed to begin immediately at 48px in an error state.
- **Desktop Agents:** the task sidebar has a fixed width (250px), the transcript region flexes, and the optional artifact pane follows its frontmatter width. Both content headers are compact (49px). Task lists, transcript, and artifacts scroll independently. The composer stays below the scrolling transcript.
- **Reading surfaces:** the conversation and follow-up composer share their maximum width (760px) and desktop horizontal inset (28px). The new-task prompt is narrower (654px), centered with automatic margins; it is an actual task-entry state, not a reusable landing-page layout.
- **Rhythm:** the spacing tokens are recurring measurements, not a forced four-pixel grid. Odd-numbered padding and gaps are also deliberately present in the source. Quiet separation comes from padding and one-pixel dividers, not a dashboard of detached cards.
- **Wide desktop, minimum width 1600px:** the artifact pane grows (365px) and the new-task content expands (680px).
- **Up to 1390px:** new-task side padding tightens; titlebar and composer keyboard hints disappear.
- **Up to 1179px:** artifacts are closed by default and open as a right drawer, sized to `min(430px, 92vw)`. Above this boundary, they are an inline pane by default.
- **Up to 900px:** titlebar metadata disappears; conversation status keeps its accessible icon but hides its visible label. Transcript/composer side insets narrow (21px).
- **Up to 760px:** the task rail is closed by default and opens as a left drawer, sized to `min(300px, 85vw)` with its existing minimum width (250px). Titlebar padding and conversation-header padding tighten.
- **Up to 480px:** only the brand mark remains; the two mode buttons stay visible. Transcript side padding narrows (16px), while the follow-up composer uses its own compact inset (13px). Workspace/safety text wraps.
- **Short viewports, maximum height 690px:** welcome spacing reduces and the bottom keyboard hint disappears; this is independent of width.
- **Editor:** the persistent iframe fills the available body. Switching mode hides rather than unmounts it. This shell's drawer rules do not restyle the editor's internal layout.

Drawers use an overlay, move and trap focus, close on Escape, restore prior focus, and make background shell controls inert. These behaviors come from the actual React components and drawer-focus hook.

## Elevation & Depth

Depth is mostly tonal and structural: darker rails, a slightly lighter work canvas, local control fills, and one-pixel borders. Resting panels, message cards, approval cards, and the composer do not have decorative shadows. The only authored shadows are soft lifts for the floating jump action and the two responsive drawers; none is a hard offset shadow.

### Shadow Vocabulary

- **Jump to latest** (`0 4px 10px #10120f55`): separates the floating transcript navigation action from messages beneath it.
- **Task drawer** (`9px 0 25px #00000035`): left-drawer lift over the workspace.
- **Artifacts drawer** (`-9px 0 25px #00000035`): right-drawer lift over the workspace.

Drawer scrims use the source translucent dark fill (`#070a086b`). Keyboard focus is a clear sage outline (2px with 3px offset), not an elevation effect. Search and composer fields instead change their container border on focus-within.

### Named Rules

**The Flat Panels, Lifted Overlays Rule.** Keep structural panels and contained content flat; reserve the existing soft shadows for drawers and the floating jump-to-latest action.

Motion is functional and sparse: running indicators rotate (1.6s linear, infinite); disclosure chevrons turn through a quarter rotation with a short transition (140ms ease-out). Most hover/focus changes are immediate. Reduced-motion styling removes transitions, makes animations effectively single-frame, and forces automatic scrolling. No entrance choreography is part of this system.

## Shapes

Use compact rectangles with restrained rounding. `control` is the common control/container corner; `compact` serves smaller actions and code-adjacent elements; `accessory` is used by the send control and small confirmation container; `badge` serves count and keycap geometry. Full-width pane edges and artifact tabs remain square. Small status dots are circles, not a reason to make actions pill-shaped.

Borders are normally one pixel. Selected task rows add a short sage-toned vertical marker (2px wide, 20px high); active artifact tabs use a bottom line (1px). These are native navigation devices in this world, not decorative section rules. Overflow is intentionally clipped at the application regions, with local scrolling for lists, code, and payloads.

Icons in the React shell are imported Lucide SVGs, generally small (12–17px), with the global CSS stroke width (1.7). Larger empty/loading-state icons are local exceptions. JSX stroke-width props do not override that global CSS rule. Key names, diff signs, and shortcut notation are meaningful text, not substitutes for vector interface icons. No shipping raster or custom font asset is introduced by this shell; the official image in `docs/research/` is reference-only, and Markdown remote images render as text placeholders.

## Components

### Buttons

Compact utility controls, not oversized calls to action.

- **Primary:** sage fill with deep olive text; the frontmatter variant records its actual padding and typography. Approval is a principal use. Hover lightens the fill, while the border remains the primary color.
- **Secondary:** neutral raised fill, main text, and a visible gray border. Hover changes both fill and border. Recovery and approval rejection use this variant.
- **Small:** compact neutral review controls, with their own border and compact radius. The current stylesheet cascade makes Accept and destructive Revert share this base appearance; their intended special tints are not recorded as working variants.
- **Text / icon:** transparent at rest; hover uses the shared hover fill and main ink. The icon target is explicitly sized; accessible names and native titles come from the shared button component. Text controls have a minimum height (25px); response/code copy is a smaller local specialization.
- **Send / stop:** the compact sage send control is replaced by a labeled stop control during an active task. Disabled send has its own darkened fill and opacity; ordinary disabled buttons use opacity (.46) and a not-allowed cursor. Do not treat disabled treatments as normal text colors.
- **Focus / pressed:** use the source keyboard outline. There is no generic authored pressed animation or button elevation. Selected navigation uses state attributes, not a fabricated universal active treatment.

### Counts and task status

Counts are small rectangular badges, not filter chips. The running count appears in the mode control only when tasks are active. Task statuses themselves are inline vector-and-label pairs, not filled pills: a spinner for Working, clock for Needs approval, checked circle for Completed, alert circle for Failed, and square for Stopped. Icon-only placements retain an accessible label and title.

### Cards / Containers

Content containers have a job rather than serving as general dashboard decoration. User messages are padded, bordered, muted-olive rectangles; assistant messages sit directly on the canvas. Command approval uses a warm tinted bordered container, explicit host-execution explanation, monospace command, directory, and Reject/Allow actions. Markdown code blocks combine a language/copy header with a scrollable preformatted body. None receives a resting shadow.

### Inputs / Fields

- **Task search:** an outlined compact field with an inline search SVG, clear control when populated, secondary-colored text, and fully opaque placeholder. Focus-within changes the border (`#7e8976`); the inner input intentionally suppresses a separate outline.
- **Composer:** a bordered raised rectangle with a transparent textarea and attached toolbar. Focus-within changes the border (`#84927a`). The textarea grows up to its source limits (78–180px normally, 110–220px for welcome), then scrolls. The toolbar carries task mode, model, and send/stop, not decorative chips.
- **Interaction:** Enter submits; Shift+Enter inserts a newline; IME composition is protected. While an agent runs, users can keep editing a draft without sending it. Existing-task follow-ups keep the original task mode.

### Navigation

The shared mode switcher is a bordered, dark segmented group with icon-plus-text buttons and a neutral selected fill. It exposes pressed state. The task list uses full-width rows, truncated titles, metadata, a selected fill, and a short left marker. Artifacts use two flat tabs, count badges, a selected underline, and arrow-key navigation. On narrow viewports these rails become drawers rather than a new bottom-navigation system.

### Changes, activity, and editor handoff

The signature is a changed path that opens in the real editor while preserving the agent session. Changes use expandable file rows, signed addition/removal totals, Diff/Before/After views, locally scrollable source, and explicit Accept/Revert actions. Accept marks an already-written edit reviewed; Revert exposes confirmation and conflict handling. Do not present acceptance as the moment a preview is first applied.

Activity is a stream of actual tools, with expandable inputs/outputs and distinct state icons. Command captions follow activity status; the main agent reports that the final refreshed captures include the corrected Completed caption. Response-copy controls are now always fully opaque, including outside hover/focus. Error and connection notices retain explicit text and recovery actions rather than relying on a color change alone.

## Do's and Don'ts

### Do:

- Do use sage for shell focus, decisive actions, links, and positive task state, with explicit state labels or accessible labels.
- Do share the configured charcoal backgrounds across shell and editor while leaving native editor syntax and interaction colors upstream-owned.
- Do preserve the task rail, transcript/composer, and artifact relationship through inline panels or drawers, and keep the real editor mounted across mode switches.
- Do retain readable transcript text, visible response-copy actions, explicit command approval, and honest tool-status captions.
- Do use Lucide SVGs for shell interface icons and keep research images outside the shipped interface.

### Don't:

- Don't turn the shell's restrained accent into a ban on native Code-OSS syntax colors, diff colors, or semantic warnings and errors.
- Don't replace the genuine editor with a simulated code card or imply this independent workbench is the proprietary Cursor application.
- Don't introduce promotional kickers, a marketing hero, or a generic detached-card dashboard into this operational surface.
- Don't reuse compact metadata or disabled-state opacity for primary instructions and conversation content.
- Don't treat derived sidecar tonal strips or overridden component declarations as shipped palette or variant tokens.

**Not canonized or repaired:** the system-font welcome display heading, very small 9px utility text, and the lost Accept/destructive-Revert tints remain build debt, not reusable rules. The tint declarations in the earlier imported workspace stylesheet are overridden by the later generic small-button rules. This documentation-only pass makes no UI repair. The main agent supplied refreshed final captures for status copy and response-copy opacity; those changes are not outstanding drift.
