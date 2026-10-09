import { _electron as electron, expect } from '@playwright/test';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = await fs.mkdtemp(path.resolve('.runtime/settings-test-'));
await fs.symlink(path.resolve('.runtime/runtime'), path.join(root, 'runtime'), 'junction');
const markdown = '---\nname: automatic-note\ndescription: Save and verify a reusable note.\n---\n# Save a note\nEnter the requested title, save, and verify the confirmation.';
let generations = 0;
const server = http.createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/v1/models') { response.end(JSON.stringify({ data: [{ id: 'fixture-vision', name: 'Fixture vision model', input_modalities: ['text', 'image'] }] })); return; }
  if (request.url !== '/v1/chat/completions') { response.writeHead(404); response.end('{}'); return; }
  let body = ''; for await (const chunk of request) body += chunk;
  const data = JSON.parse(body);
  expect(data.model).toBe('fixture-vision');
  expect(data.messages[0].content.filter(c => c.type === 'image_url').length).toBeGreaterThan(1);
  expect(data.messages[0].content[0].text).toContain('user has not supplied a task description');
  expect(data.tools).toBeUndefined(); generations++;
  response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ markdown, uncertainties: ['Synthetic local provider fixture; no remote model was called.'] }) } }] }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
let app, page;
async function resize(width, height) {
  await app.evaluate(({ BrowserWindow }, size) => { const main = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Record a Skill'); if (main.isMaximized()) main.unmaximize(); main.setMinimumSize(300, 400); main.setSize(...size); }, [width, height]);
  await expect.poll(() => page.evaluate(() => innerWidth < 450), { timeout: 10000 }).toBe(width < 450);
}
try {
  app = await electron.launch({ args: ['.'], env: { ...process.env, RECORD_A_SKILL_TEST_DATA: root } });
  page = await app.firstWindow();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(async ({ app, BrowserWindow, desktopCapturer, globalShortcut }) => {
    const services = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('./electron/services.cjs');
    const save = services.saveSkill; services.saveSkill = markdown => save(markdown, process.getBuiltinModule('path').join(app.getPath('userData'), 'installed-fixtures'));
    const register = globalShortcut.register.bind(globalShortcut);
    globalShortcut.register = (key, callback) => { if (key === 'Control+Alt+F12') return false; globalThis.__recordShortcut = callback; return register(key, callback); };
    const target = new BrowserWindow({ width: 900, height: 600, title: 'Auto install fixture', backgroundColor: '#fff', webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    await target.loadURL('data:text/html,' + encodeURIComponent('<!doctype html><title>Auto install fixture</title><body style="font:24px Segoe UI;padding:50px;background:white;color:#111"><h1>Save a reusable note</h1><label>Title <input id="title" style="font:inherit"></label><p><button id="save" style="font:inherit">Save</button></p><p id="result">Enter a title, then save.</p><script>document.getElementById("save").onclick=()=>document.getElementById("result").textContent="Saved: "+document.getElementById("title").value</script></body>'));
    const sources = desktopCapturer.getSources.bind(desktopCapturer);
    desktopCapturer.getSources = async options => (await sources(options)).filter(s => s.name === 'Auto install fixture');
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Auto install skill' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch', { name: 'Auto install skill' }).click();
  await expect(page.getByRole('switch', { name: 'Auto install skill' })).toHaveAttribute('aria-checked', 'true');
  const shortcut = page.getByRole('button', { name: 'Change recording shortcut' });
  await shortcut.click(); await expect(shortcut).toHaveAttribute('aria-pressed', 'true');
  await page.locator('h1').click(); await page.keyboard.press('Control+Alt+F11');
  await expect(shortcut).toHaveAttribute('aria-pressed', 'false');
  expect((await page.evaluate(() => window.recorder.check())).settings.shortcut).toBe('Control+Alt+F11');
  expect(await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Alt+F11'))).toBe(true);
  await shortcut.click(); await expect(shortcut).toHaveAttribute('aria-pressed', 'true');
  expect(await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Alt+F11'))).toBe(false);
  await page.keyboard.press('Control+Alt+F11'); await expect(shortcut).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Alt+F11'))).toBe(true);
  await shortcut.click(); await expect(shortcut).toHaveAttribute('aria-pressed', 'true'); await page.keyboard.press('Escape');
  await expect(shortcut).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Alt+F11'))).toBe(true);
  await shortcut.click(); await expect(shortcut).toHaveAttribute('aria-pressed', 'true'); await shortcut.press('Control+Alt+F12');
  await expect(page.getByRole('alert')).toContainText('already in use');
  expect((await page.evaluate(() => window.recorder.check())).settings.shortcut).toBe('Control+Alt+F11');
  await shortcut.press('Escape'); await page.getByRole('button', { name: 'Dismiss error' }).click();
  await expect.poll(() => app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Alt+F11'))).toBe(true);
  const provider = page.getByRole('combobox', { name: 'Generation provider', exact: true });
  for (const id of ['gemini-cli', 'kimi-code', 'grok-cli', 'claude-code']) {
    await provider.selectOption(id);
    await expect(page.getByRole('button', { name: 'Refresh connection', exact: true })).toBeEnabled({ timeout: 65000 });
    const checks = await page.evaluate(() => window.recorder.check());
    const target = { 'gemini-cli': 'Antigravity', 'grok-cli': 'Grok', 'claude-code': 'Claude' }[id];
    if (target) { await expect(page.getByRole('checkbox', { name: target, exact: true })).toBeChecked(); await expect(page.getByRole('checkbox', { name: target, exact: true })).toBeDisabled(); }
    if (checks.toolInstalled) {
      await expect(page.getByRole('button', { name: /^Continue with / })).toHaveCount(checks.signedIn ? 0 : 1);
      await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue('default');
    } else {
      await expect(page.getByRole('button', { name: /^Install / })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toHaveCount(0);
    }
  }
  expect((await page.evaluate(() => window.recorder.check())).skillRoots.map(p => path.basename(path.dirname(p)))).toEqual(['.agents', '.claude']);
  await expect(page.locator('.settings-account')).toHaveCSS('display', 'flex');
  await resize(1440, 900); await page.screenshot({ path: '.impeccable/review/official-tool-desktop.png', fullPage: true });
  await resize(390, 844); await page.screenshot({ path: '.impeccable/review/official-tool-mobile.png', fullPage: true });
  await resize(1440, 900);
  await provider.selectOption('chatgpt');
  await page.getByRole('button', { name: 'Add connection' }).click();
  for (const kind of ['qwen', 'kimi', 'deepseek', 'claude', 'grok', 'custom']) await page.getByLabel('Provider', { exact: true }).selectOption(kind);
  await page.getByLabel('Connection name', { exact: true }).fill('Local test provider · fixture');
  await page.getByLabel('API base URL', { exact: true }).fill(endpoint);
  await page.getByRole('button', { name: 'Save connection', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue('fixture-vision');
  await resize(1440, 900); await page.screenshot({ path: '.impeccable/review/settings-desktop.png', fullPage: true });
  await resize(390, 844); await page.screenshot({ path: '.impeccable/review/settings-mobile.png', fullPage: true });
  await resize(1440, 900);
  await page.getByRole('button', { name: 'Add connection' }).click();
  await page.getByLabel('Provider', { exact: true }).selectOption('claude');
  await page.screenshot({ path: '.impeccable/review/connection-form-desktop.png', fullPage: true });
  await resize(390, 844); await page.screenshot({ path: '.impeccable/review/connection-form-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await resize(1320, 860);
  await page.getByRole('button', { name: 'Back to recording' }).click();
  await page.getByRole('button', { name: 'Window', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh capture sources' }).click();
  await page.getByRole('button', { name: 'Auto install fixture', exact: true }).click();
  await page.getByRole('switch', { name: 'Record microphone' }).click();
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeEnabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  // Invoke the callback registered with Electron: verify both the native registration and dispatch.
  await app.evaluate(() => globalThis.__recordShortcut());
  await expect(page.getByRole('button', { name: 'Stop & create skill' })).toBeVisible();
  const target = app.windows().find(w => w.url().startsWith('data:'));
  await target.locator('#title').fill('Synthetic installed note'); await target.locator('#save').click();
  await expect(target.locator('#result')).toHaveText('Saved: Synthetic installed note');
  await expect.poll(async () => Number((await page.locator('.video-status .timer').textContent()).split(':')[1])).toBeGreaterThanOrEqual(4);
  await app.evaluate(() => globalThis.__recordShortcut());
  await expect(page.getByRole('heading', { name: 'Your skill is installed.' })).toBeVisible({ timeout: 300000 });
  await expect(page.locator('.steps .complete')).toHaveCount(3);
  await expect(page.locator('.steps [aria-current=step]')).toHaveCount(0);
  const viewer = page.getByRole('textbox', { name: 'View installed skill markdown', exact: true });
  await expect(viewer).toHaveAttribute('readonly', '');
  await viewer.focus(); await viewer.press('End'); await viewer.press('X');
  await expect(viewer).toHaveValue(markdown);
  await page.getByRole('button', { name: 'Narration', exact: true }).click();
  await expect(page.locator('.transcript')).toBeVisible();
  await expect(page.locator('.transcript [contenteditable=true], .transcript textarea')).toHaveCount(0);
  await page.getByRole('button', { name: 'SKILL.md', exact: true }).click();
  const file = path.join(root, 'installed-fixtures/automatic-note/SKILL.md');
  expect(await fs.readFile(file, 'utf8')).toBe(markdown);
  await expect(page.getByRole('button', { name: 'Install skill' })).toHaveCount(0);
  await page.screenshot({ path: '.impeccable/review/auto-installed-desktop.png', fullPage: true });
  await resize(390, 844); await page.screenshot({ path: '.impeccable/review/auto-installed-mobile.png', fullPage: true });
  await page.evaluate(() => window.recorder.retry());
  await expect(page.getByRole('alert')).toContainText('already exists', { timeout: 300000 });
  await expect(page.getByRole('heading', { name: 'Make it a skill.' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Edit skill markdown', exact: true })).not.toHaveAttribute('readonly', '');
  await expect(page.locator('.steps .complete')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Install skill' })).toBeEnabled();
  expect(await fs.readFile(file, 'utf8')).toBe(markdown); expect(generations).toBe(2); expect(errors).toEqual([]);
  await app.evaluate(({ app }) => app.exit()); await app.close();
  app = await electron.launch({ args: ['.'], env: { ...process.env, RECORD_A_SKILL_TEST_DATA: root } });
  const restarted = await app.firstWindow();
  await restarted.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(restarted.getByRole('switch', { name: 'Auto install skill' })).toHaveAttribute('aria-checked', 'true');
  await expect(restarted.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue('fixture-vision');
  expect((await restarted.evaluate(() => window.recorder.check())).settings.shortcut).toBe('Control+Alt+F11');
  console.log('Verified Settings persistence, protected connections, native shortcut registration/dispatch and conflict recovery, automatic installation, and duplicate protection against a local provider fixture.');
} finally {
  if (app) { await app.evaluate(({ app }) => app.exit()).catch(() => {}); await app.close().catch(() => {}); }
  server.close(); server.closeAllConnections();
  await fs.unlink(path.join(root, 'runtime'));
  if (!path.resolve(root).startsWith(path.resolve('.runtime/settings-test-'))) throw new Error('Unexpected test cleanup target.');
  await fs.rm(root, { recursive: true, force: true });
}
