# Record a Skill

<!-- impeccable:product-schema 1 -->

## Platform

web

The interface runs inside an Electron desktop app for Windows. This platform value describes the web-rendered interface; the first release targets Windows desktop users.

## Stack

Confirmed by the user: Electron with React and TypeScript.

Confirmed architecture: Electron recording â†’ local video processing â†’ selected generation connection â†’ skill preview or automatic installation. ChatGPT uses direct browser sign-in and Responses; Claude, Kimi, Antigravity, and Grok use their unmodified official local tools with provider browser sign-in. Optional API connections remain available as a separate mode.

Video-processing foundation: `claude-real-video[fast]` 0.10.7, invoked through app-local Python. FFmpeg and FFprobe are bundled; first-run setup installs the local processor. Codex CLI is no longer bundled or used.

## Users

The creator and other Windows users who want to demonstrate a repeatable workflow and turn it into a reusable skill for compatible agent applications, including Codex and Claude.

Users may demonstrate tasks across Windows applications and websites, including switching between applications while recording.

## Product Purpose

Let Windows users teach an agent a workflow by recording their screen, then convert the demonstration into an editable skill.

Success means a user can record a complete task, stop recording, receive a skill draft automatically, and save it after optional review. Automatic installation is opt-in. Skills describe reusable inputs, steps, decision points, and checks for successful completion. Their usefulness must be evaluated with different inputs.

## Positioning

A Windows desktop workflow for recording a demonstration and turning it into a reusable agent skill. It brings screen capture, local evidence preparation, model generation, and skill review into one application.

## Operating Context

The user chooses a capture source and records a demonstration. There is no task-description field: the selected model infers the task and intended outcome from chronological video moments and available narration. Whole-screen recording is part of the intended experience.

Pressing Stop initiates processing after the video finishes saving. The app extracts timestamped frames and narration, submits evidence and the generation prompt through the selected connection, and displays the generated skill. Auto install can bypass review; validation and duplicate protection still apply.

Users should not need to manually extract screenshots, copy prompts, or upload each frame. Recordings remain available to check missing or ambiguous steps.

Local processing prepares the evidence. The app sends selected images and text to OpenAI's Responses API for generation; local preprocessing does not mean offline model inference. Continue with ChatGPT opens the system browser for this app's own authorization; it does not require an API key or an installed ChatGPT desktop app. Eligible plan access is required.

## Capabilities and Constraints

- Upload an existing video through a native file picker; copy it into a local session, detect audio, and use the same evidence and generation flow without recording again. The original file is preserved.
- Windows desktop recording, including the entire selected display and workflows spanning multiple applications.
- Local video processing into useful frames and timestamped evidence.
- Automatic processing and generation through the selected provider after the user stops recording.
- An editable preview and saved skill output centered on `SKILL.md`.
- A floating recording toolbar with timer, pause/resume, microphone toggle, and Stop.
- Microphone narration is on by default. Users can disable it before recording or mute during recording.
- Skills install into the shared `.agents/skills` folder for compatible agents and the selected provider's global folder for Claude, Grok, or Antigravity. A duplicate in any destination prevents all new copies. Existing content is never overwritten.
- Settings includes Also save to checkboxes for Claude, Grok, and Antigravity, off by default. Each provider automatically includes its own global folder: `.claude/skills`, `.grok/skills`, or `.gemini/config/skills`, alongside `.agents/skills`. Existing Claude copy preferences migrate to the Claude checkbox. Choices apply to manual and automatic installation and update a current draft destination while preserving its generation provider.
- Settings exposes optional Auto install, a configurable global start/stop shortcut (default Ctrl+Shift+R), generation connections, account configuration, and models. Shortcuts work while the app is open and use the selected source. Assignment captures keys throughout Settings, suspends the old global binding and menu accelerators, and restores the binding after saving, cancellation, or leaving Settings. Conflicts preserve the previous shortcut choice.
- Direct ChatGPT sign-in replaces Codex CLI. Saved accounts, model discovery, plan usage, and sign-out live in Settings; connected accounts hide Continue with ChatGPT. Windows-protected app credentials remain in the main process.
- Claude Code, current TypeScript Kimi Code, Antigravity CLI, and Grok Build handle browser login and generation. Antigravity replaces the retired personal-account Gemini CLI path while retaining the saved Google provider selection. Its native Windows binary installs from Google's release manifest after SHA-512 verification, without Node/npm. Its official terminal handles onboarding, browser authorization, and `/logout`; the app reuses its native session without copying credentials. Antigravity manages account changes in its own CLI. Claude, Kimi, and Grok retain saved-account selection and Add account using separate official-tool configuration folders. Their packages and a checksum-verified Node.js runtime install into app-private folders. Kimi requires Git Bash; Grok uses a separate app-managed home. All connections support Sign out, usage links, and refresh. Antigravity discovers models with `agy models`; Kimi/Grok use ACP and Claude uses its initialization response. Tools retain configured defaults with optional manual model IDs.
- Optional API connections support Qwen, Kimi, DeepSeek, Claude, Grok, and custom OpenAI-compatible endpoints. API keys have their own billing and protected storage. Model catalogs are fetched dynamically, with explicit manual IDs when discovery is unavailable. No DeepSeek or Qwen browser integration is claimed in this release.
- Local preparation retains raw audio and video; only frames and transcript text are submitted. Generation disables execution tools; official ACP client permissions deny file and terminal requests. Antigravity uses a temporary custom agent and pre-tool hook that permits only viewing supplied recording images and denies other actions. It requires successful image inspection before accepting a draft and removes temporary evidence and agent configuration after completion or cancellation. The official CLI retains its normal conversation history.
- Skill instructions should generalize demonstration-specific values into inputs and identify uncertainty rather than invent missing actions.
- Generated instructions do not themselves supply computer-use, browser, or application tools; replay depends on the target agent environment.

Open decisions:

- Windows version support and minimum hardware requirements.
- Public distribution channel, signing identity, and long-term recording retention policy.
- Evidence selection controls beyond the automatic extraction in the first release.
- Multi-monitor simultaneous capture, click-event capture, and Windows accessibility metadata.
- Pricing, licensing of the application, and future documented browser integrations for additional providers.

## Brand Commitments

Confirmed product name: Record a Skill.

## Evidence on Hand

The workspace contains an Electron/React/TypeScript implementation and screenshots in `.impeccable/review`. Desktop integration records a synthetic window and exercises pause/resume, local extraction, mocked generation, and review. Settings integration checks persistence, protected API connections, official-tool controls, native shortcut callbacks, automatic installation, and duplicate recovery using a local fixture. It does not inject physical OS keys. ChatGPT browser sign-in/model discovery are live verified; generation was blocked by its usage limit. Claude Code and Antigravity CLI generated validated drafts from synthetic images. Antigravity's existing native Google session and model catalog were verified live; fresh browser onboarding and logout use fixtures. Native adapter tests cover image inspection, errors, cancellation cleanup, installer checksum verification, and pre-tool gates that deny unrelated reads, commands, and writes. Kimi/Grok image handling and completion/cancellation use ACP fixtures; authenticated generation is unverified live. Official Grok installation was checked in an isolated app folder. Tool-installation UI checks cover missing tools, progress, cancellation, failure/retry, sign-in readiness, and Antigravity's native account controls. API vendors use fixtures. Tests cover authentication, credential storage, refresh, streams, validation, and installation rollback.

Candidate processing toolkit: https://github.com/HUANGCHIHHUNGLeo/claude-real-video

Toolkit integration has been exercised. Frame selection retains small visual changes with a lower deduplication threshold; the extraction budget is 48 images at 1600px width. This budget can miss brief states or thin long demonstrations. Do not claim measured accuracy or reliable replay without evidence.

## Product Principles

- Keep the core path focused: select, record, stop, review, save.
- Make processing progress and recoverable failures understandable to users.
- Preserve useful evidence and timestamps so a draft can be checked against the demonstration.
- Generate adaptable instructions with clear success checks and explicit gaps.
- Make clear which processing happens locally and which evidence is sent for model analysis.
