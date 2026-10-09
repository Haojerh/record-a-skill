# Record a Skill

A Windows desktop app built with Electron, React, and TypeScript. Record a display or application window, narrate the workflow, and press Stop to automatically prepare evidence and generate an editable agent skill.

## Download

Download the Windows x64 installer from [GitHub Releases](https://github.com/Haojerh/record-a-skill/releases). Version [1.0.0](https://github.com/Haojerh/record-a-skill/releases/tag/1.0.0) includes the latest provider folders, installation checkboxes, and shortcut assignment fixes.

## Run

Requires Windows x64 and Node.js 22.12+ (or 20.19+).

```powershell
npm ci
npm run dev
```

For a production build:

```powershell
npm run build
npm start
```

Use **Set up** in the app to install app-local Python and `claude-real-video[fast]`. Python is not installed system-wide. FFmpeg and FFprobe are bundled. Use **Continue with ChatGPT** to authorize Record a Skill in your browser, then choose an available model. No API key, Codex CLI, or ChatGPT desktop installation is required. Setup needs internet access; the narration model downloads on its first use.

Direct generation uses OpenAI's [Sign in with ChatGPT integration for open-source/local apps](https://developers.openai.com/siwc/token-sharing-open-source). An eligible ChatGPT plan and authorization for plan usage are required. This is a separate connection from any existing ChatGPT or Codex login. **Manage usage** opens ChatGPT settings for your plan and app limits.

Windows protects the app's credentials through Electron `safeStorage` (DPAPI). Tokens stay in the main process and encrypted app-local storage; they never reach React. The app verifies OAuth state, PKCE, and the signed ID token, renews expiring sessions, and keeps saved registrations separate. **Sign out** attempts to revoke the renewable session and clears local tokens; a network failure reports when remote revocation could not be confirmed.

## Record and install

1. Choose an entire display or application window. Your selected model infers the task from the demonstrated moments; no task description is required.
2. Leave the microphone on for narration, or turn it off before starting.
3. Record the workflow. The floating toolbar opens at the top-right of the selected display and lets you pause, resume, mute, and stop. A compact progress strip shows the current stage and completed steps.
4. Stop to save the video, select timestamped frames, transcribe available narration, and send the evidence through your selected generation connection.
5. Review the recording and draft. Clicking an evidence frame seeks to its timestamp. Edit `SKILL.md` and resolve any listed uncertainties.
6. Select **Install skill**. The app saves to `%USERPROFILE%\.agents\skills\<name>\SKILL.md`, plus the selected provider's folder for Claude, Grok, or Antigravity and any extra folders checked in Settings. Existing skills are preserved; change the YAML name to install another version. A duplicate in any destination prevents all new copies.

You can also choose **Upload video** beside Capture source. Select an MP4, WebM, MOV, MKV, AVI, M4V, WMV, MPEG, or MPG file; the app copies it into a local session and automatically prepares a skill draft. The original file is preserved. Audio is transcribed when present; silent videos use frames alone. Complete local setup and choose a connected provider/model first.

## Settings and accounts

**Settings** contains recording preferences, generation connections, accounts, and model selection. **Auto install skill** is off by default; enabling it installs validated drafts immediately after generation. Successful auto-install marks all progress steps complete and shows a read-only installed skill and narration view. Installation failures keep the draft available for manual editing. **Also save to** offers checkboxes for Claude (`.claude/skills`), Grok (`.grok/skills`), and Antigravity (`.gemini/config/skills`) under your home folder. Extra copies are off by default; each of these providers automatically includes its own folder alongside `.agents/skills`. Existing Claude copy preferences are preserved. Checkbox changes also update a current draft while preserving its generation provider. Duplicate protection applies across all selected folders.

The global start/stop shortcut defaults to **Ctrl + Shift + R**, works while this app is open, and uses the selected capture source. Click the shortcut in Settings, then press your chosen key combination; Escape cancels. Key capture works throughout Settings and temporarily suspends the existing global binding and menu accelerators so they cannot intercept your chosen keys. Saving, canceling, or leaving Settings restores the recording shortcut. A conflicting shortcut preserves the previous choice.

Browser sign-in options:

- **ChatGPT**: direct authorization in your browser; no local CLI required. Connected accounts show account controls instead of the sign-in button.
- **Claude Code**: install the official, unmodified tool and select it in Settings. **Continue with Claude Code** opens its own `claude auth login` browser flow. The app runs the published tool with image evidence; it never reads or copies Claude tokens. Model choices come from the installed tool’s initialization response, alongside its configured default and optional manual IDs.
- **Kimi Code**: install the current TypeScript [Kimi Code CLI](https://www.kimi.ai/help/kimi-code/cli-getting-started), then use its `kimi login` browser/device flow. The archived Python Kimi CLI is not supported.
- **Antigravity CLI**: replaces Gemini CLI for personal Google accounts. Use **Install Antigravity CLI**, then **Continue with Antigravity CLI**. Sign-in opens the official terminal for onboarding and browser authorization; after setup, it exits automatically or you can type `/exit`. Existing Antigravity credentials are reused. The app keeps the previous Google provider selection, but does not reuse Gemini CLI login folders. Antigravity manages its own Google session; change accounts in its CLI, then use **Refresh connection**. Sign out opens the official `/logout` flow; close the terminal with `/exit` when finished.

- **Grok Build**: install the official [Grok CLI](https://docs.x.ai/build/overview), then use **Continue with Grok Build**. Its browser sign-in and credentials use a separate app-managed Grok home; an existing global Grok login is not copied.

When a selected official tool is missing, Settings offers **Install**. Antigravity downloads its native Windows binary from Google's official release manifest and verifies its SHA-512 checksum; no Node/npm runtime is needed. The other tools use a checksum-verified official Node.js LTS runtime and published packages in the app's private tools folder. Kimi Code also requires Git Bash; if missing, installation uses Windows Package Manager to install Git for the current user. Installation shows progress, supports cancellation and retry, and then offers browser sign-in.

Claude, Kimi, and Grok connections offer an account selector, **Add account**, **Sign out**, and usage controls. Each added account uses a separate configuration folder owned by its official tool. Antigravity uses its native Google session and offers **Sign out** and usage controls, with account changes handled in its official CLI. Login completion updates the UI automatically. The app saves account labels and selection, not tool tokens. **Refresh connection** rechecks externally changed credentials. Signing out the default connection also affects that tool's existing login.

On Windows, Claude, Kimi, and Grok browser authentication runs in a hidden subprocess. Antigravity requires its official interactive terminal for onboarding and logout. Login supports cancellation and has a ten-minute timeout. The app does not change Defender settings.

ChatGPT and API model lists are fetched from the selected account/provider. Opening Settings refreshes the connected ChatGPT account’s catalog automatically, preserving the selected model while it remains available. If refresh fails, the last catalog remains available and the error is shown; use Refresh models to retry. Kimi and Grok report models through ACP; Antigravity uses its native `agy models` command. Official tools offer their configured default and optional manual model IDs. Choose a model that accepts images. After migrating from Gemini CLI, select Antigravity's default or a model from its refreshed catalog.

Antigravity generation uses the official CLI's streaming mode and a temporary custom agent under `~/.gemini/config/agents`. A pre-tool hook permits only reads of the supplied temporary recording images and blocks other actions. Drafts are accepted only after every image has been inspected and a successful final result is returned. Temporary evidence and the agent definition are removed after completion or cancellation; Antigravity retains its own conversation history under its normal settings.

Optional **Add connection** supports API keys for Qwen, Kimi, DeepSeek, Claude, Grok, and custom OpenAI-compatible services, including local servers. This is explicitly an API connection with separate provider billing. Keys use Windows-protected storage and are never sent to the renderer. A manual model ID is available when discovery is unsupported. Provider web-chat login alone does not supply an integration credential: DeepSeek has no documented public browser integration here, and Qwen Code discontinued its former OAuth free tier. No cookie scraping or borrowed OAuth client is used.

Recording is local; generation sends selected screenshots and narration text through your chosen connection. ChatGPT uses Responses with `store: false`, streaming, a structured schema, and no execution tools, accepting only `response.completed`. API connections use image Chat Completions or Claude Messages and require a complete response. Official tools receive image content directly; generation disables their actions and denies client file/terminal permissions. Raw audio and video stay local. Skills are instructions for compatible agent applications; a model alone does not automatically discover skill folders or supply browser/computer-control tools.

Sessions are stored in Electron's user-data folder, normally `%APPDATA%\record-a-skill\sessions`. **Local files** opens the current session folder. Recordings remain available after processing errors or cancellation. Retention is manual in this first release.

## Build a Windows installer

```powershell
npm run package
```

The NSIS installer and unpacked app are placed in `release/<version>/`. Installation is per user. The app is unsigned; public distribution should add your own signing certificate. This first build targets Windows x64 and records one display or window at a time. System audio, simultaneous multi-monitor capture, and automatic workflow replay are outside this release.

## Verify

```powershell
npm test
node tests/setup.cjs
npm run build
npm run test:desktop
npm run test:settings
node tests/chatgpt-models-desktop.mjs
npm run test:tools
npm run test:import
```

The setup script uses `.runtime/` for isolated test dependencies. The desktop integration test records a synthetic application window, exercises the floating controls, runs real local frame extraction and a mock direct ChatGPT response, and saves UI evidence in `.impeccable/review/`. It does not install the generated skill into your personal folder. Unit tests cover PKCE, callback and identity validation, encrypted credential persistence, refresh serialization, sign-out, interrupted or failed streams, and validated skill installation.

`node tests/signin-live.mjs` is a separate interactive check: authorize the app in the browser, dismiss its first-sign-in confirmation, and verify real direct generation from a synthetic workflow image. It uses the normal app credential store and consumes generation quota. It does not install a skill. For a live recording integration run, authorize the app in the `.runtime/` test profile and set `RECORD_A_SKILL_LIVE_CHATGPT=1` before `npm run test:desktop`.

The live ChatGPT check verified browser sign-in and account-specific models; generation returned an account usage-limit error. Claude Code and Antigravity CLI generated validated drafts from synthetic images. Antigravity's existing native Google session and model discovery were verified live; fresh browser onboarding and logout use fixtures. Antigravity tests cover missing image inspections, provider errors, cancellation cleanup, native installer checksums, and pre-tool gates that deny unrelated reads, commands, and writes. Kimi and Grok use ACP subprocess fixtures; authenticated generation is unverified live. The official Grok installation and binary version check passed in an isolated app folder. Tool-installation UI tests cover missing tools, progress, cancellation, failure/retry, and readiness for sign-in. Git Bash installation through winget is unverified live because Git was already installed. API protocol tests use fixtures. Settings integration verifies persistence, native shortcut callbacks, local-provider generation, automatic installation, and duplicate recovery; it does not inject a physical OS shortcut or install test skills into personal folders.

Production uses a restrictive content security policy and an isolated preload API. The local Vite development server permits its React refresh preamble; this exception is absent from the production build.

## Processing components

- [claude-real-video](https://github.com/HUANGCHIHHUNGLeo/claude-real-video): local keyframe selection and transcription, version 0.10.7.
- [uv](https://github.com/astral-sh/uv): app-local Python setup; downloads are checked against the pinned release's SHA-256 checksum.
- [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source): authorized direct model requests with images and a JSON output schema.
- [jose](https://github.com/panva/jose): signature and OpenID Connect identity-token validation.
- [FFmpeg](https://ffmpeg.org/): local video decoding; distributed through `ffmpeg-static` and `ffprobe-static`.

Bundled components retain their own licenses. Review FFmpeg's GPL/LGPL distribution requirements and the bundled licenses before publishing a commercial installer.
