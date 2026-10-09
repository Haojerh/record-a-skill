import { _electron as electron, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

await fs.mkdir('.impeccable/review', { recursive: true });
const app = await electron.launch({ args: ['.'], env: { ...process.env, RECORD_A_SKILL_TEST_DATA: path.resolve('.runtime') } });
  const page = await app.firstWindow();
page.on('pageerror', error => console.error('Renderer error:', error.message));
async function resizeMain(width, height) {
  await app.evaluate(({ BrowserWindow }, size) => {
    const main = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Record a Skill');
    main.setMinimumSize(300, 400); main.setSize(size.width, size.height);
  }, { width, height });
  // Native resize returns before Chromium receives the new viewport.
  await expect.poll(() => page.evaluate(() => innerWidth < 450), { timeout: 10000 }).toBe(width < 450);
}
try {
  if (process.env.RECORD_A_SKILL_LIVE_CHATGPT !== '1') await app.evaluate(() => {
    const services = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('./electron/services.cjs');
    const { kinds } = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('./electron/providers.cjs');
    services.configureAuth({
      status: async () => ({ signedIn: true, accountId: 'fixture-account', accounts: [{ id: 'fixture-account', label: 'Desktop test fixture', connected: true }], models: [{ id: 'fixture-model', name: 'Visual fixture model' }], model: 'fixture-model', welcome: false, providerId: 'chatgpt', providerName: 'ChatGPT', modelSource: 'provider', providerKinds: kinds, connections: [] }),
      generate: async input => {
        if (!input[0].text.includes('user has not supplied a task description') || input.filter(item => item.type === 'input_image').length < 2) throw new Error('Missing task-inference prompt or video moments.');
        return { markdown: '---\nname: save-note\ndescription: Save a reusable note and verify its confirmation.\n---\n# Save a note\nEnter a reusable title, choose Save note, and verify the saved result.', uncertainties: ['Desktop integration uses a mock ChatGPT response; live generation is tested separately.'] };
      }
    });
  });
  await app.evaluate(async ({ BrowserWindow, desktopCapturer }) => {
    const target = new BrowserWindow({ width: 900, height: 600, title: 'Workflow test', backgroundColor: '#fff', webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    await target.loadURL('data:text/html,' + encodeURIComponent('<!doctype html><title>Workflow test</title><body style="font:24px Segoe UI;padding:50px;background:#fff;color:#111"><h1>Create a reusable note</h1><label>Note title <input id="title" style="font:inherit" /></label><p><button id="save" style="font:inherit">Save note</button></p><p id="result">Enter a title, then save.</p><script>document.getElementById("save").onclick=()=>{document.getElementById("result").textContent="Saved: "+document.getElementById("title").value}</script></body>'));
    const original = desktopCapturer.getSources.bind(desktopCapturer);
    desktopCapturer.getSources = async options => (await original(options)).filter(source => source.name === 'Workflow test');
    BrowserWindow.getAllWindows().find(w => w !== target).focus();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue with ChatGPT', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add account', exact: true })).toBeEnabled();
  await page.screenshot({ path: '.impeccable/review/connected-account-desktop.png', fullPage: true });
  await resizeMain(390, 844); await page.screenshot({ path: '.impeccable/review/connected-account-mobile.png', fullPage: true });
  await resizeMain(1320, 860);
  await page.getByRole('button', { name: 'Back to recording' }).click();
  await page.getByRole('button', { name: 'Window', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh capture sources' }).click();
  await expect(page.getByRole('button', { name: 'Workflow test' })).toBeVisible();
  await page.getByRole('button', { name: 'Workflow test' }).click();
  // Isolated first-run fixture: exercise both incomplete prerequisite indicators.
  await app.evaluate(async ({ app }) => {
    const services = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('./electron/services.cjs');
    const actual = await services.check(app.getPath('userData'));
    globalThis.__recordTestCheck = services.check;
    services.check = async () => ({ ...actual, processor: false, signedIn: false, accountId: '', accounts: [], models: [], model: '' });
  });
  await page.reload();
  await expect(page.locator('.not-ready')).toHaveCount(2);
  await expect(page.locator('.not-ready').first()).toHaveCSS('color', 'rgb(255, 130, 121)');
  await page.screenshot({ path: '.impeccable/review/setup-incomplete.png', fullPage: true });
  await app.evaluate(() => {
    process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('./electron/services.cjs').check = globalThis.__recordTestCheck;
    delete globalThis.__recordTestCheck;
  });
  await page.reload();
  await page.getByRole('button', { name: 'Window', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh capture sources' }).click();
  await page.getByRole('button', { name: 'Workflow test' }).click();
  await expect(page.getByRole('switch', { name: 'Record microphone' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Describe the repeatable task')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeEnabled({ timeout: 30000 });
  await resizeMain(1440, 900);
  await page.screenshot({ path: '.impeccable/review/desktop.png', fullPage: true });
  await resizeMain(390, 844);
  await page.screenshot({ path: '.impeccable/review/mobile.png', fullPage: true });
  await resizeMain(1320, 860);
  await page.getByRole('switch', { name: 'Record microphone' }).click();
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeEnabled({ timeout: 30000 });
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('button', { name: 'Stop & create skill' })).toBeVisible({ timeout: 15000 });
  await expect.poll(() => app.windows().some(win => win.url().includes('toolbar')), { timeout: 20000 }).toBe(true);
  const toolbar = app.windows().find(win => win.url().includes('toolbar'));
  const placement = await app.evaluate(({ BrowserWindow, screen }) => {
    const bar = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('toolbar'));
    const bounds = bar.getBounds(); const area = screen.getDisplayMatching(bounds).workArea;
    return { top: bounds.y - area.y, right: area.x + area.width - bounds.x - bounds.width };
  });
  // Device-pixel rounding can differ by one DIP at Windows display scaling.
  expect(Math.abs(placement.top - 16)).toBeLessThanOrEqual(1);
  expect(Math.abs(placement.right - 16)).toBeLessThanOrEqual(1);
  await fs.writeFile('.impeccable/review/toolbar-placement.json', JSON.stringify(placement, null, 2));
  await toolbar.getByRole('button', { name: 'Pause recording' }).click();
  await expect(toolbar.getByRole('button', { name: 'Resume recording' })).toBeVisible();
  await toolbar.screenshot({ path: '.impeccable/review/toolbar.png' });
  await toolbar.getByRole('button', { name: 'Resume recording' }).click();
  const target = app.windows().find(win => win.url().startsWith('data:'));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Workflow test').focus());
  await expect.poll(async () => Number((await toolbar.locator('.timer').textContent()).split(':')[1]), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  await target.locator('#title').fill('Example weekly summary');
  await expect.poll(async () => Number((await toolbar.locator('.timer').textContent()).split(':')[1]), { timeout: 15000 }).toBeGreaterThanOrEqual(4);
  await target.locator('#save').click();
  await expect(target.locator('#result')).toHaveText('Saved: Example weekly summary');
  // Let the recorder capture a few frames of the saved outcome.
  await expect.poll(async () => Number((await toolbar.locator('.timer').textContent()).split(':')[1]), { timeout: 15000 }).toBeGreaterThanOrEqual(8);
  await toolbar.getByRole('button', { name: 'Stop', exact: true }).click();
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toBeVisible();
  await expect(cancel).toHaveCSS('color', 'rgb(255, 170, 163)');
  await page.screenshot({ path: '.impeccable/review/processing.png', fullPage: true });
  await expect(page.getByRole('heading', { name: 'Make it a skill.' })).toBeVisible({ timeout: 300000 });
  const markdown = await page.getByLabel('Edit skill markdown').inputValue();
  expect(markdown).toMatch(/^---/);
  await page.screenshot({ path: '.impeccable/review/skill-preview.png', fullPage: true });
  expect(await page.getByRole('button', { name: /^Jump to/ }).count()).toBeGreaterThan(1);
  await expect(page.locator('.frame-strip img[src$="frame_final.jpg"]')).toBeVisible();
  await resizeMain(390, 844);
  await page.screenshot({ path: '.impeccable/review/skill-mobile.png', fullPage: true });
  await resizeMain(1320, 860);
  await page.getByRole('button', { name: /^Jump to/ }).first().click();
  expect(await page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThanOrEqual(0);
  await page.getByRole('button', { name: 'Narration', exact: true }).click();
  await expect(page.getByText('No narration was available for this session.')).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Record a Skill').webContents.send('recorder:event', { type: 'error', message: 'Your ChatGPT session has expired. Continue with ChatGPT again, then retry.' }));
  await expect(page.getByRole('button', { name: 'Configure', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Retry processing' })).toBeEnabled();
  await expect(page.getByText('Your draft is ready to review.', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: '.impeccable/review/auth-recovery-desktop.png', fullPage: true });
  await resizeMain(390, 844);
  await page.screenshot({ path: '.impeccable/review/auth-recovery-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Configure', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue with ChatGPT', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add account', exact: true })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toBeEnabled();
  console.log(`Verified real window capture, pause/resume, automatic local processing, ${process.env.RECORD_A_SKILL_LIVE_CHATGPT === '1' ? 'live' : 'mock'} direct ChatGPT generation, evidence navigation, and draft editing.`);
} finally { await app.evaluate(({ app }) => app.exit()); await app.close(); }
