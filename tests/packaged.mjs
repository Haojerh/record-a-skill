import { _electron as electron, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
const packageDir = process.argv[2] || `release/${version}`;
const app = await electron.launch({ executablePath: path.resolve(packageDir, 'win-unpacked/Record a Skill.exe'), env: { ...process.env, RECORD_A_SKILL_TEST_DATA: path.resolve('.runtime') } });
try {
  expect(await app.evaluate(({ app }) => app.getVersion())).toBe(version);
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'A workflow worth keeping.' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Session progress' }).getByText('Record workflow')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Session progress' }).getByText('Review & install')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recording setup' })).toBeVisible();
  await expect(page.locator('#goal')).toHaveCount(0);
  const checks = await page.evaluate(() => window.recorder.check());
  expect(checks.processor).toBe(true);
  expect(typeof checks.signedIn).toBe('boolean');
  expect(Array.isArray(checks.accounts)).toBe(true);
  expect(typeof checks.settings.autoInstall).toBe('boolean');
  expect(Array.isArray(checks.settings.additionalSkillTargets)).toBe(true);
  expect(checks.providerKinds.map(k => k.id)).toContain('claude');
  expect(checks.providerKinds.map(k => k.id)).toContain('grok');
  expect(checks.localTools.map(t => t.id)).toContain('grok-cli');
  expect(checks.localTools.find(t => t.id === 'gemini-cli').name).toBe('Antigravity CLI');
  expect(checks.localTools.find(t => t.id === 'gemini-cli').singleAccount).toBe(true);
  expect(await page.evaluate(() => typeof window.recorder.toolInstall)).toBe('function');
  if (!checks.signedIn) {
    await expect(page.locator('.generation-summary')).toHaveCount(0);
    const configure = page.locator('.readiness > div').filter({ hasText: 'Generation provider' }).getByRole('button', { name: 'Configure' });
    if (await configure.count()) await expect(configure).toBeEnabled();
    else await expect(page.getByRole('combobox', { name: 'Generation provider', exact: true })).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Auto install skill' })).toBeVisible();
  for (const name of ['Claude', 'Grok', 'Antigravity']) await expect(page.getByRole('checkbox', { name, exact: true })).toBeVisible();
  const shortcut = page.getByRole('button', { name: 'Change recording shortcut' });
  await shortcut.click(); await expect(shortcut).toHaveAttribute('aria-pressed', 'true');
  expect((await page.evaluate(() => window.recorder.check())).shortcutRegistered).toBe(false);
  await page.getByRole('button', { name: 'Back to recording' }).click();
  if (checks.shortcutRegistered) await expect.poll(async () => (await page.evaluate(() => window.recorder.check())).shortcutRegistered).toBe(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const centered = await page.locator('.settings-page').evaluate(el => { const box = el.getBoundingClientRect(); return Math.abs(box.left - (document.documentElement.clientWidth - box.right)); });
  expect(centered).toBeLessThan(2);
  const select = page.getByRole('combobox', { name: 'Generation provider', exact: true });
  await expect(select).toHaveCSS('padding-right', '40px');
  await expect(select).toHaveCSS('appearance', 'none');
  if (checks.signedIn) await expect(page.getByRole('button', { name: 'Continue with ChatGPT', exact: true })).toHaveCount(0);
  else await expect(page.getByRole('button', { name: 'Continue with ChatGPT', exact: true })).toBeVisible();
  const sources = await page.evaluate(() => window.recorder.sources());
  expect(sources.some(s => s.type === 'screen')).toBe(true);
  const bridge = await page.evaluate(() => ({ require: typeof window.require, process: typeof window.process }));
  expect(bridge).toEqual({ require: 'undefined', process: 'undefined' });
  expect(await fs.stat(path.join(packageDir, 'win-unpacked/resources/app.asar.unpacked/node_modules/@openai/codex')).then(() => true, () => false)).toBe(false);
  const loginRoot = await fs.mkdtemp(path.resolve('.runtime/login-packaged-'));
  const loginFixture = path.join(loginRoot, 'login fixture.cjs'), loginReceipt = path.join(loginRoot, 'receipt.json');
  let terminal;
  try {
    await fs.writeFile(loginFixture, `const args=process.argv.slice(2); if(args.includes('status')) console.log(JSON.stringify({loggedIn:true})); else if(args.includes('-p')) { require('node:readline').createInterface({input:process.stdin}).on('line',()=>console.log(JSON.stringify({type:'control_response',response:{request_id:'models',response:{models:[]}}}))); } else require('node:fs').writeFileSync(${JSON.stringify(loginReceipt)}, JSON.stringify({ args, stdin: !!process.stdin.isTTY, stdout: !!process.stdout.isTTY }));`);
    await app.evaluate(async ({ app }, { root, fixture, nodeExecutable }) => {
      const require = process.getBuiltinModule('module').createRequire(process.getBuiltinModule('path').join(app.getAppPath(), 'package.json'));
      const { createLocalTools } = require('./electron/local-tools.cjs');
      return createLocalTools(root, { find: async () => ({ executable: nodeExecutable, args: [fixture] }) }).login('claude-code');
    }, { root: loginRoot, fixture: loginFixture, nodeExecutable: process.execPath });
    for (let attempt = 0; attempt < 100; attempt++) {
      const data = await fs.readFile(loginReceipt, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (data) { terminal = JSON.parse(data); break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(terminal, 'Packaged browser sign-in executed its fixture').toBeTruthy();
    expect(terminal.args).toEqual(['auth', 'login']);
    expect(terminal.stdin).toBe(false); expect(terminal.stdout).toBe(false);
  } finally {
    expect(path.resolve(loginRoot).startsWith(path.resolve('.runtime/login-packaged-'))).toBe(true);
    await fs.rm(loginRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  console.log('Packaged app verified: renderer, isolated preload, screen sources, local processor, direct ChatGPT sign-in, and no bundled Codex CLI.');
  console.log('Packaged official-tool browser sign-in verified with a subprocess fixture; no accounts were changed.');
} finally { await app.evaluate(({ app }) => app.exit()); await app.close(); }
