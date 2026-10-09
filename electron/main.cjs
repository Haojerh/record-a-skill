const { app, BrowserWindow, desktopCapturer, ipcMain, session: electronSession, protocol, net, dialog, shell, screen, safeStorage, globalShortcut } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const services = require('./services.cjs');
const { createClient } = require('./chatgpt.cjs');
const { createSettings, validate: validateSettings } = require('./settings.cjs');
const { createProviders } = require('./providers.cjs');
const { createLocalTools, tools: localKinds } = require('./local-tools.cjs');
protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);
if (process.env.RECORD_A_SKILL_TEST_DATA) app.setPath('userData', process.env.RECORD_A_SKILL_TEST_DATA);
const instanceLock = app.requestSingleInstanceLock();
if (!instanceLock) app.quit();
let main, toolbar, current, streamFile, selectedSource, selectedDisplay, operation, recording = false, writeQueue = Promise.resolve();
let activity = 'Skill generation';
let preferences, shortcutWarning = '';
app.on('second-instance', () => { main?.show(); main?.focus(); });
const dev = process.argv.includes('--dev');
const root = () => app.getPath('userData');
function emit(data) { if (main && !main.isDestroyed()) main.webContents.send('recorder:event', data); }
function load(window, hash = '') {
  if (dev) window.loadURL(`http://127.0.0.1:5173/${hash}`);
  else window.loadFile(path.join(__dirname, '../dist/index.html'), { hash: hash.replace('#', '') });
}
function secure(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
}
function createMain() {
  main = new BrowserWindow({ width: 1320, height: 860, minWidth: 880, minHeight: 650, backgroundColor: '#12171e', title: 'Record a Skill', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
  secure(main); load(main);
  main.on('close', async event => {
    if (!recording && !operation) return;
    event.preventDefault();
    const result = await dialog.showMessageBox(main, { type: 'question', buttons: ['Keep working', recording ? 'Stop recording' : 'Cancel'], defaultId: 0, cancelId: 0, message: recording ? 'A recording is in progress.' : `${activity} is still running.` });
    if (result.response === 1) { if (recording) emit({ type: 'command', command: 'stop' }); else operation?.abort(); }
  });
}
function createToolbar() {
  const display = screen.getAllDisplays().find(d => String(d.id) === selectedDisplay) || screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  toolbar = new BrowserWindow({ width: 410, height: 76, x: area.x + area.width - 410 - 16, y: area.y + 16, resizable: false, frame: false, alwaysOnTop: true, skipTaskbar: true, backgroundColor: '#1b222c',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  // Windows may round the requested width at non-integer display scaling.
  toolbar.setPosition(area.x + area.width - toolbar.getBounds().width - 16, area.y + 16);
  toolbar.setContentProtection(true); secure(toolbar); load(toolbar, '#toolbar');
  toolbar.on('close', event => { if (recording) { event.preventDefault(); emit({ type: 'command', command: 'stop' }); } });
}
function handle(name, fn, allowToolbar = false) {
  ipcMain.handle(`recorder:${name}`, async (event, ...args) => {
    if (event.sender !== main?.webContents && !(allowToolbar && event.sender === toolbar?.webContents)) throw new Error('Unauthorized window.');
    try { return await fn(...args); }
    catch (error) { throw new Error(error.message || 'The operation failed.'); }
  });
}
async function processRecording() {
  if (!current || recording || operation) throw new Error('Finish recording before processing.');
  operation = new AbortController();
  activity = 'Skill generation';
  delete current.installed; delete current.installError;
  emit({ type: 'progress', stage: 'frames', message: 'Preparing your recording…', session: publicSession() });
  try {
    const configuration = await services.check(root(), (await preferences.get()).additionalSkillTargets);
    current.providerKind = configuration.providerKind;
    current.skillRoots = configuration.skillRoots;
    await services.analyze(root(), current, data => emit({ type: 'progress', ...data, session: publicSession() }), operation.signal);
    operation.signal.throwIfAborted();
    if ((await preferences.get()).autoInstall) {
      try { current.installed = await services.saveSkill(current.markdown, current.skillRoots); }
      catch (error) { current.installError = `Automatic installation failed: ${error.message} Your draft is ready to edit and install manually.`; }
      await fs.writeFile(path.join(current.dir, 'session.json'), JSON.stringify(current, null, 2));
    }
    emit({ type: 'ready', session: publicSession() });
  }
  catch (e) { emit({ type: 'error', message: e.name === 'AbortError' ? 'Processing canceled. Your recording is saved; retry when ready.' : e.message, session: publicSession() }); }
  finally { operation = null; }
}
function publicSession() {
  if (!current) return null;
  const { dir, ...rest } = current;
  return { ...rest, videoUrl: `media://${current.id}/${current.videoFile || current.sourceFile || 'source.webm'}`, frames: (current.frames || []).map(f => ({ ...f, url: `media://${current.id}/evidence/frames/${f.file}` })) };
}
app.whenReady().then(async () => {
  if (!instanceLock) return;
  const chatgpt = createClient(root(), { storage: safeStorage, openBrowser: url => shell.openExternal(url) });
  const localTools = createLocalTools(root());
  const providers = createProviders(root(), { storage: safeStorage, chatgpt, localTools });
  services.configureAuth(providers);
  preferences = createSettings(root());
  function shortcutAction() {
    if (operation) return;
    main?.show(); main?.focus();
    emit({ type: 'command', command: recording ? 'stop' : 'start' });
  }
  const initial = await preferences.get();
  if (!globalShortcut.register(initial.shortcut, shortcutAction)) shortcutWarning = 'Recording shortcut is unavailable. Choose a different shortcut in Settings.';
  async function checks() {
    const settings = await preferences.get();
    return { ...await services.check(root(), settings.additionalSkillTargets), sessionSkillRoots: current?.skillRoots, settings, shortcutRegistered: globalShortcut.isRegistered(settings.shortcut), shortcutWarning };
  }
  protocol.handle('media', async request => {
    const url = new URL(request.url);
    if (!current || url.hostname !== current.id || !(url.pathname === `/${current.sourceFile || 'source.webm'}` || /^\/(recording\.mp4|evidence\/frames\/[\w.-]+\.jpg)$/.test(url.pathname))) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(path.join(current.dir, url.pathname.slice(1))).toString(), { headers: request.headers });
  });
  electronSession.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(contents === main?.webContents && permission === 'media' && recording && (details.mediaTypes || []).every(t => ['audio', 'video'].includes(t))));
  electronSession.defaultSession.setPermissionCheckHandler((contents, permission) => contents === main?.webContents && (permission === 'media' || permission === 'display-capture'));
  electronSession.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (request.frame !== main?.webContents.mainFrame || !selectedSource || !recording) return callback({});
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const source = sources.find(s => s.id === selectedSource);
    callback(source ? { video: source } : {});
  });
  handle('check', checks);
  handle('shortcutCapture', async active => {
    if (typeof active !== 'boolean') throw new Error('Invalid shortcut capture state.');
    const { shortcut } = await preferences.get();
    main.webContents.setIgnoreMenuShortcuts(active);
    if (active) globalShortcut.unregister(shortcut);
    else if (!globalShortcut.isRegistered(shortcut) && !globalShortcut.register(shortcut, shortcutAction)) throw new Error('Recording shortcut is unavailable. Choose a different shortcut in Settings.');
  });
  handle('settings', async input => {
    if (operation || recording) throw new Error('Finish the current session before changing settings.');
    operation = new AbortController(); activity = 'Settings update';
    try {
      const next = validateSettings(input), previous = await preferences.get();
      const changed = next.shortcut !== previous.shortcut;
      if (changed && !globalShortcut.register(next.shortcut, shortcutAction)) throw new Error('That shortcut is already in use. Choose another; your settings have not changed.');
      try { await preferences.save(next); }
      catch (error) { if (changed) globalShortcut.unregister(next.shortcut); throw error; }
      if (current?.skillRoots) current.skillRoots = services.skillDirectories(current.providerKind, undefined, next.additionalSkillTargets);
      if (changed) globalShortcut.unregister(previous.shortcut);
      if (changed) shortcutWarning = ''; return await checks();
    } finally { operation = null; }
  });
  handle('setup', async () => {
    if (operation || recording) throw new Error('Finish the current session first.');
    operation = new AbortController();
    activity = 'Local setup';
    try { await services.setup(root(), message => emit({ type: 'setup', message }), operation.signal); return await checks(); }
    finally { operation = null; }
  });
  handle('login', async accountId => {
    if (operation || recording) throw new Error('Finish the current session first.');
    operation = new AbortController();
    activity = 'ChatGPT sign-in';
    try {
      await chatgpt.login(accountId, operation.signal);
      if ((await chatgpt.status()).welcome) {
        await dialog.showMessageBox(main, { type: 'info', title: 'Record a Skill', message: "You're using your ChatGPT plan", detail: 'Eligible skill generation uses your ChatGPT plan or available credits. Review usage and app limits with Manage usage in Record a Skill.', buttons: ['Got it'], defaultId: 0 });
        await chatgpt.acknowledge();
      }
      return await checks();
    }
    finally { operation = null; }
  });
  handle('toolInstall', async id => {
    if (operation || recording) throw new Error('Finish the current session first.');
    operation = new AbortController(); activity = 'Tool installation';
    try {
      const result = await localTools.install(id, message => emit({ type: 'setup', message }), AbortSignal.any([operation.signal, AbortSignal.timeout(10 * 60 * 1000)]));
      return { ...await checks(), warning: result.warning };
    } finally { operation = null; }
  });
  for (const [name, action] of [['toolLogin', (id, newAccount) => { emit({ type: 'setup', message: 'Finish signing in in your browser…' }); return localTools.login(id, operation.signal, newAccount); }], ['toolAccount', (id, accountId) => localTools.selectAccount(id, accountId, operation.signal)], ['toolLogout', id => localTools.logout(id, operation.signal)], ['account', id => chatgpt.selectAccount(id, operation.signal)], ['model', (id, manual) => providers.selectModel(id, manual)], ['logout', () => chatgpt.logout(operation.signal)], ['provider', id => providers.select(id)], ['saveProvider', input => providers.saveProfile(input, operation.signal)], ['removeProvider', id => providers.remove(id)], ['refreshModels', () => providers.refreshModels(operation.signal)]]) handle(name, async (...args) => {
    if (operation || recording) throw new Error('Finish the current session first.');
    operation = new AbortController();
    activity = 'Account configuration';
    try { const result = await action(...args); return { ...await checks(), warning: result.warning }; }
    finally { operation = null; }
  });
  handle('acknowledge', async () => { await chatgpt.acknowledge(); return checks(); });
  handle('manageUsage', id => {
    const urls = { chatgpt: 'https://chatgpt.com/settings/usage', 'claude-code': 'https://claude.ai/settings/usage', 'kimi-code': 'https://www.kimi.ai/code/console', 'gemini-cli': 'https://www.antigravity.google/docs/plans', 'grok-cli': 'https://grok.com/' };
    if (id && !urls[id]) throw new Error('Choose a browser sign-in provider.');
    return shell.openExternal(urls[id || 'chatgpt']);
  });
  handle('toolDocs', id => { const tool = localKinds.find(t => t.id === id); if (!tool) throw new Error('Choose an official tool.'); return shell.openExternal(tool.docs); });
  handle('sources', async () => (await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 360, height: 210 } })).filter(s => !s.name.includes('Record a Skill')).map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL(), type: s.id.startsWith('screen:') ? 'screen' : 'window' })));
  handle('importVideo', async () => {
    if (recording || operation) throw new Error('Finish the current session first.');
    operation = new AbortController(); activity = 'Video import';
    try {
      const chosen = await dialog.showOpenDialog(main, { title: 'Choose a video to turn into a skill', properties: ['openFile'], filters: [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'wmv', 'mpeg', 'mpg'] }] });
      if (chosen.canceled || !chosen.filePaths.length) return null;
      emit({ type: 'setup', message: 'Copying your video into a local session…' });
      current = await services.importVideo(root(), chosen.filePaths[0], operation.signal);
      return publicSession();
    } finally { operation = null; }
  });
  handle('begin', async input => {
    if (recording || operation) throw new Error('A session is already running.');
    if (!input || typeof input.sourceId !== 'string') throw new Error('Choose a screen or window first.');
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const source = sources.find(s => s.id === input.sourceId);
    if (!source) throw new Error('That source is no longer available. Refresh and choose another.');
    const id = crypto.randomUUID(); const dir = path.join(root(), 'sessions', id);
    await fs.mkdir(dir, { recursive: true });
    current = { id, dir, sourceName: source.name, microphone: !!input.microphone, createdAt: new Date().toISOString(), frames: [] };
    await fs.writeFile(path.join(dir, 'session.json'), JSON.stringify(current, null, 2));
    streamFile = await fs.open(path.join(dir, 'source.webm'), 'wx');
    selectedSource = source.id; selectedDisplay = source.display_id; recording = true; writeQueue = Promise.resolve();
    return publicSession();
  });
  handle('append', chunk => {
    if (!recording || !streamFile || !(chunk instanceof Uint8Array) || chunk.byteLength > 32 * 1024 * 1024) throw new Error('Recording data could not be saved.');
    writeQueue = writeQueue.then(async () => {
      const buffer = Buffer.from(chunk); let offset = 0;
      while (offset < buffer.length) offset += (await streamFile.write(buffer, offset, buffer.length - offset)).bytesWritten;
    });
    return writeQueue;
  });
  handle('finish', async (process = true) => {
    if (!recording) return;
    let failed;
    try { await writeQueue; } catch (e) { failed = e; }
    finally { await streamFile?.close(); streamFile = null; recording = false; selectedSource = null; toolbar?.destroy(); toolbar = null; main.show(); }
    if (failed) throw failed;
    if (process) void processRecording();
  });
  handle('status', status => {
    if (!recording) return;
    if (!status || typeof status.elapsed !== 'number') throw new Error('Invalid recording status.');
    if (!toolbar) createToolbar();
    toolbar.webContents.send('recorder:event', { type: 'status', ...status });
  });
  handle('command', command => { if (!['pause', 'stop', 'microphone'].includes(command)) throw new Error('Unknown recording control.'); emit({ type: 'command', command }); }, true);
  handle('retry', () => { void processRecording(); });
  handle('cancel', () => { operation?.abort(); });
  handle('save', async markdown => services.saveSkill(markdown, current?.skillRoots || (await services.check(root(), (await preferences.get()).additionalSkillTargets)).skillRoots));
  handle('openFolder', () => shell.openPath(current?.dir || root()));
  createMain();
});
app.on('window-all-closed', () => { operation?.abort(); app.quit(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
