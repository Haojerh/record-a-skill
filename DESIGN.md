---
name: Record a Skill
description: A matte slate session console for recording and reviewing reusable workflows.
colors:
  background: "#12171e"
  text: "#e8edf4"
  surface: "#1b222c"
  raised: "#242e3a"
  line: "#354150"
  muted: "#a8b6c7"
  accent: "#8eb5ff"
  blue: "#3567c8"
  green: "#8bd5b0"
  white: "#fff"
  hover: "#2b3747"
  primary-hover: "#4175d8"
  danger: "#bd443d"
  danger-hover: "#ce5148"
  recording: "#ff8279"
  warning: "#e5be80"
  cancel: "#ffaaa3"
  cancel-hover-text: "#ffd0cb"
  cancel-hover-surface: "#382525"
  signin-background: "#0a0e14"
  signin-hover: "#18202a"
typography:
  headline:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "29px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-.025em"
  title:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  caption:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
  editor:
    fontFamily: "Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.75
rounded:
  frame: "5px"
  control: "6px"
  source: "7px"
  segmented: "8px"
  panel: "12px"
  circle: "50%"
spacing:
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "22": "22px"
  "24": "24px"
  "32": "32px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    width: "100%"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 14px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "0 9px"
  button-stop:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "0 13px"
  button-stop-hover:
    backgroundColor: "{colors.danger-hover}"
  button-cancel:
    backgroundColor: "transparent"
    textColor: "{colors.cancel}"
    rounded: "{rounded.control}"
    padding: "0 9px"
  button-cancel-compact:
    backgroundColor: "transparent"
    textColor: "{colors.cancel}"
    rounded: "{rounded.control}"
    padding: "0 7px"
  button-cancel-hover:
    backgroundColor: "{colors.cancel-hover-surface}"
    textColor: "{colors.cancel-hover-text}"
  button-chatgpt-signin:
    backgroundColor: "{colors.signin-background}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
    width: "100%"
  button-chatgpt-signin-hover:
    backgroundColor: "{colors.signin-hover}"
  account-select:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "7px 40px 7px 10px"
    width: "100%"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
  segment-selected:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
    padding: "0 13px"
  skill-editor:
    backgroundColor: "#151d27"
    textColor: "{colors.text}"
    typography: "{typography.editor}"
    rounded: "0"
    padding: "20px 22px"
    height: "345px"
    width: "100%"
---

# Design System: Record a Skill

## Overview

**Creative North Star: "Session console"**

A calm Windows desktop console makes recording and reviewing a workflow feel concrete. Matte slate surfaces, native Segoe UI, restrained blue actions, and explicit state labels keep attention on the user's demonstration and editable instructions.

The interface is compact and practical. Borders separate working areas; source thumbnails, recording video, and timestamped evidence supply the imagery. Lucide line icons and the authored geometric favicon support the controls without decorative raster art.

**Key Characteristics:**
- Matte slate surfaces and visible dividers.
- Native Windows typography with a distinct markdown editor face.
- Restrained blue actions, green completion, and red recording, Cancel, or setup cues.
- Compact progress labels and evidence anchored to timestamps.
- Motion attached to state changes, with reduced motion support.

## Colors

The palette combines cool slate neutrals with blue actions and explicit operational status colors. Frontmatter preserves the CSS custom-property names `surface`, `raised`, `line`, `muted`, `accent`, `blue`, and `green`; other entries record reused literal values from `src/styles.css`.

### Primary
- **Action Blue** (`blue`): full-width Start and Install actions and the enabled microphone switch.
- **Action Blue Hover** (`primary-hover`): primary button hover state.
- **Soft Blue** (`accent`): selected source borders, selected tabs, text actions, and keyboard focus outlines.

### Neutral
- **Deep Slate** (`background`): application canvas.
- **Matte Slate** (`surface`): the evidence panel, setup/editor panel, and recording toolbar.
- **Raised Slate** (`raised`): secondary controls and selected segments.
- **Divider Slate** (`line`): panel borders and internal separators.
- **Cool Light** (`text`): primary text and control content.
- **Muted Slate Text** (`muted`): supporting instructions, captions, and inactive state labels.
- **White** (`white`): text on blue and red actions.
- **Hover Slate** (`hover`): ordinary control hover feedback.
- **Sign-in Ground** (`signin-background`): the near-black ChatGPT authorization action; also reused by video and frame previews in the source.
- **Sign-in Hover** (`signin-hover`): enabled authorization hover; the source also uses this tone for scrollbar tracks.

Green signals readiness, completed progress, and installation success. Recording and incomplete setup circles use the same red indicator. Stop has its own darker red action fill and hover state. Cancel uses light coral text, with a subdued red hover surface and lighter coral text; error notices share those last two colors. Warm amber identifies paused indicators and points requiring review. Error borders use their component-specific subdued red stroke.

**The Action and State Rule.** Keep blue attached to actions, selection, and focus; communicate operational states with text and the existing green, red, and amber cues.

## Typography

**Interface Font:** Segoe UI, with system-ui and sans-serif fallbacks.
**Editor Font:** Consolas, with a monospace fallback.

The native Windows face is the confirmed interface choice, including page headings. There is no separate decorative display role. Typography differentiates task hierarchy through size and weight, while timestamps use tabular numerals.

### Hierarchy
- **Headline:** the page's current task; the mobile variant uses (24px).
- **Title:** panel headings and the application name.
- **Body:** explanatory text; the heading subtitle uses (14px) on desktop.
- **Label:** progress titles; secondary controls use the same size with their own muted color assignment.
- **Caption:** hints, timestamps, paths, and short status detail.
- **Editor:** editable skill markdown. Narration uses the interface face, (13px), and a more open line height (1.8).

Progress titles use line height (1.3); their status detail uses (1.4). On narrow screens these become (11px) and (10px), respectively. Supporting copy stays in sentence case.

Account and model labels and native select text use regular interface type (12px). Plan usage and account status copy use the caption size.

**The Readable Evidence Rule.** Keep timestamps tabular and reserve the monospace face for editable markdown.

## Layout

The application header is (65px) tall. Main content is centered within a maximum width of (1600px), with desktop padding (32px). The working grid gives evidence more room than setup or editing: `minmax(0, 1.65fr) minmax(330px, 1fr)`, with a (20px) gutter and top-aligned panels. This is the shipped console composition, not a required layout for every future surface.

Panel headings are (55px) high. Their horizontal padding and most evidence/editor insets use (22px); setup uses (24px) at both top and bottom. The idle Start area uses padding (0 22px 24px), following the setup body's lower inset. Repeated control and content gaps use the extracted spacing steps in frontmatter.

At (1000px), main padding becomes (24px), the grid changes to `minmax(0, 1.4fr) minmax(310px, 1fr)`, and source selection becomes one column. At (720px), the workspace stacks, main padding becomes (24px 16px), source selection returns to two columns, and the footer stacks.

The numbered progress rail has three content-sized desktop items, separated by a border and (12px) gaps; it does not stretch labels across the available width. Narrow screens use three equal columns, (8px) gaps, and vertically arranged markers and labels.

Settings is horizontally centered within the main content, using the same main inset and a maximum width of (980px). Its stacked sections have a (24px) gap and retain the panel surface, border, and radius. Preference rows use (24px 22px) padding, a (28px) control gap, and supporting copy capped at (62ch). Section headings can grow beyond their (55px) minimum height. Generation content uses (24px 22px) insets; inline connection forms use two equal columns with (20px) gaps and full-width endpoint, key, and model fields. At (720px), forms become one column, section content uses (22px 18px) insets, and shortcut and connection-summary rows stack.

The floating toolbar is an Electron window (410 by 76 DIP), initially positioned at the selected display's work-area top-right with (16 DIP) margins. Its background is draggable; buttons remain interactive. This placement is verified in `electron/main.cjs`.

## Elevation & Depth

The interface uses no CSS box shadows. Matte background tones, one-pixel panel borders, divider lines, and selected borders establish depth. The always-on-top recording toolbar is a separate native window; it inherits the same matte surface rather than introducing a web shadow vocabulary.

**The Divider Rule.** Separate panel sections with the existing line color and tonal surfaces.

## Shapes

Controls have gently curved corners; panels have the broadest reused radius. Source previews use a slightly softer radius than buttons. Circular geometry is reserved for status lights, selection checks, switches, and progress markers. Source and evidence selection use a (2px) border. Panels clip their content with `overflow: hidden`.

Secondary action borders use the source's `#546277`. This is a component-specific literal, not an additional general-purpose palette role.

## Components

### Buttons

Direct and compact, with icon and label gaps (8px), semibold interface text (13px), and a default minimum height (36px).

- **Primary:** full-width blue Start and Install actions, with white text and a minimum height (43px).
- **Secondary:** raised slate with a one-pixel border, used for pause, microphone, and recovery actions.
- **Quiet:** muted text, compact horizontal padding, and a slate hover background; labels use (12px).
- **Stop:** red with white content and a square Lucide icon; remains visually identifiable beside recording controls.
- **Cancel:** coral text in both processing and prerequisite setup; enabled hover uses a subdued red fill and lighter coral text. Processing uses quiet-action padding and minimum height (36px); setup uses text-action padding and minimum height (30px).
- **ChatGPT sign-in:** full-width near-black action with white text, a one-pixel secondary-action border, and minimum height (40px). The official white ChatGPT SVG is shown at (18px) beside Continue with ChatGPT. Enabled hover uses Sign-in Hover; focus and disabled treatment follow existing buttons.
- **Focus:** a soft-blue outline (2px), offset (3px).
- **Disabled:** opacity (.48) and a `not-allowed` cursor.

### Cards / Containers

Border-separated work areas use the matte surface, the panel radius, and one-pixel divider strokes. A header separates the panel title from its content. Evidence, setup, and editor content use the existing inset rhythm; panels do not float on shadows.

Installation confirmation places its check (17px) beside the first success text line, with a top margin (2px). The text and wrapped destination path form a separate column, keeping the check aligned to the confirmation line as the path wraps.

### Inputs / Fields

The markdown editor is a flat, borderless inset surface with the editor typography, minimum height (180px), and an inward focus outline offset (-3px). Content is vertically resizable. The caret and keyboard outline use Soft Blue.

Settings fields pair muted labels with raised-slate native inputs and selects, one-pixel divider borders, control corners, a minimum height (38px), and padding (8px 10px). Label-to-field gaps are (8px); field text and labels use (12px). Placeholders use muted text, carets use Soft Blue, and keyboard focus retains the outward accent outline. Disabled fields use opacity (.65). The account select retains its existing minimum height (36px) and vertical/left padding (7px / 10px). All account and Settings selects reserve (40px) right text padding and show a line chevron (16px) inset (14px) from the right border. These remain native HTML selects with native keyboard and option behavior; forced-colors mode restores the native arrow and (10px) right padding. Model refresh sits beside the select; optional manual model entry expands inline through a disclosure. Connection forms keep their actions below the fields, with a secondary Save connection and coral Cancel.

### Recording Setup

Setup begins with the microphone row. Its lower divider separates the row from readiness checks. The switch is blue when enabled. Incomplete prerequisites use red outlined Lucide circles (14px); completed prerequisites use green checks (16px), both beside readable prerequisite labels. Local processor setup uses blue text. With an unconfigured account or no selected catalog model, the generation summary is hidden and blue Configure sits beside the incomplete Generation provider readiness row. Once the connection is signed in and the selected model exists in its catalog, a compact summary identifies the provider, selected model, and installation preference; Configure sits beside its provider heading and leads to Settings. Cancel retains the red treatment.

### Settings Preferences

Preference rows place a sentence-case heading and supporting copy beside a switch or secondary shortcut control. The Auto install switch reuses the microphone switch's shape and enabled blue state. Shortcut text uses tabular numerals and does not wrap; its pressed capture state shows a readable prompt, while invalid or conflicting shortcuts show coral text with an alert role. Busy updates expose a status notice and Cancel action. These are stateful controls within the existing bordered panels.

### Accounts and Models

Account and model configuration lives in Settings, below recording and installation preferences. The provider select distinguishes browser sign-in from API connections in its option labels. The saved ChatGPT account group remains a vertical stack with gaps (9px), but Settings replaces its former lower divider and bottom spacing with a top margin (20px), no border, and no padding. The model group is separate, with a top divider, margin and padding (22px); its native select follows the Settings field treatment. Muted labels identify each select. Keyboard focus uses the existing accent outline; disabled selects use opacity (.65).

Continue with ChatGPT opens authorization in the system browser and is hidden when the selected account is connected. Saved account options identify signed-out registrations in their labels. Add account and Sign out are blue text actions arranged on one row; Sign out appears for a connected account. Using ChatGPT plan and Manage usage share a caption-sized row. Model options come from the selected connection's available catalog; a refresh icon sits beside the select, including when no models are loaded. The header Settings action is disabled during recording and processing; configuration updates disable editable controls while busy.

Official Claude, Kimi, and Gemini tool connections use a secondary sign-in action, blue Refresh connection and help actions, and a caption-sized connection status. Their actions wrap within the account area. API connections are separately labeled and use a summary with endpoint text that wraps, followed by inline edit or add forms. Optional manual model IDs expand beneath the model selector for non-ChatGPT connections. These surfaces reuse existing controls and colors.

The sign-in mark is the official vector at `public/chatgpt-logo-white.svg`, sourced from [OpenAI's sign-in asset](https://developers.openai.com/assets/siwc/sign-in-buttons/chatgpt-logo-white.svg). Preserve its white artwork and the recognizable action label. The local asset is an interface identity mark, consistent with the console's SVG imagery stance.

### Error Recovery

Account status messages use the existing blue-toned notice surface and `role="status"`; failures use the existing red-toned error notice and `role="alert"`, with a dismiss action. Usage or plan failures expose a secondary Manage usage action above the error notice. Feedback also appears in Settings. Error-state recording setup retains Configure beside the evidence panel's Retry processing and New recording actions.

The first successful sign-in displays a native informational usage notice with a Got it action. Its presentation belongs to the Windows dialog rather than the web panel styling. Fixture account labels and model options illustrate control states; they do not establish supported plans, model availability, or successful live generation.

### Navigation

Source mode controls sit within a darker bordered segmented enclosure. Selected buttons use the raised surface and Soft Blue text. Editor tabs use the same selected colors and a bottom divider, with `aria-pressed` communicating selection. Header actions group Local files and Settings at the right; selected Settings uses the raised surface and Soft Blue text with `aria-pressed`. Narrow screens hide these action labels while preserving icons and the Settings accessible name. Settings includes a quiet Back to recording action. There is no application-wide navigation sidebar in the shipped interface.

### Progress Rail

Each item combines a circular number or completed check with a short title and status detail. The current marker uses a blue-tinted fill and accent border; completed markers use a green-tinted fill and green border. Text accompanies every state.

Keyed current-stage labels reveal through `clip-path` over (180ms), using `cubic-bezier(.16,1,.3,1)`. The processing dot pulses over (1.4s) while work is active. `prefers-reduced-motion: reduce` disables both animations and all transitions.

### Capture and Evidence

Source thumbnails use a (16:10) viewport; video uses (16:9). Images and video use `object-fit: contain`. The selected source has an accent border and a circular check. Evidence frame buttons are (120px) wide, with (120 by 70px) previews and tabular timestamp captions; selecting one seeks the video to that moment.

### Floating Recording Toolbar

The toolbar shows a state dot, tabular timer (16px, weight 600), short state label, microphone, pause/resume, and Stop. Its (16px) horizontal padding and (12px) gaps keep the controls compact. The draggable surface excludes buttons through Electron app-region rules. Toolbar icons are (17px); interface icons otherwise follow Lucide sizes supplied by the component and a shared stroke width (1.8).

## Do's and Don'ts

### Do:
- **Do** use matte slate surfaces and visible borders to separate working areas.
- **Do** keep blue attached to actions, selection, and keyboard focus.
- **Do** pair state colors with readable labels or completed checks.
- **Do** keep desktop progress items content-sized with 12px gaps.
- **Do** retain tabular timestamps and the distinct markdown editor face.
- **Do** tie label motion to state changes and honor reduced motion.

### Don't:
- **Don't** add decorative raster imagery to this console.
- **Don't** replace the confirmed native interface typography with a decorative display face.
- **Don't** introduce box-shadow elevation where the existing dividers and tonal surfaces establish depth.
- **Don't** stretch desktop progress labels evenly across the workspace.
- **Don't** use color as the only signal for recording, progress, selection, or completion.
