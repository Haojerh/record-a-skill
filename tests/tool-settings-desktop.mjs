import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = await fs.mkdtemp(path.resolve('.runtime/tool-ui-test-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, RECORD_A_SKILL_TEST_DATA: root } });
try {
  const page = await app.firstWindow();
  const base = await page.evaluate(() => window.recorder.check());
  await app.evaluate(({ ipcMain, BrowserWindow }, checks) => {
    let current = { ...checks, providerId: 'chatgpt', signedIn: false, accounts: [], warning: undefined, shortcutWarning: '' };
    globalThis.__installFailure = false;
    for (const name of ['check', 'provider', 'toolInstall', 'toolLogin', 'toolAccount', 'toolLogout', 'refreshModels', 'manageUsage', 'cancel']) ipcMain.removeHandler(`recorder:${name}`);
    ipcMain.handle('recorder:check', () => current);
    ipcMain.handle('recorder:provider', (_, id) => { const tool = current.localTools.find(t => t.id === id); current = { ...current, providerId: id, providerName: tool.name, toolInstalled: false, signedIn: false, accounts: [], accountId: '', model: 'default', models: [{ id: 'default', name: `Default from ${tool.name}` }], modelSource: 'tool', warning: undefined }; return current; });
    ipcMain.handle('recorder:toolInstall', async (_, id) => {
      if (id !== current.providerId) throw Error('Wrong fixture tool');
      BrowserWindow.getAllWindows()[0].webContents.send('recorder:event', { type: 'setup', message: `Installing official ${current.providerName}…` });
      await new Promise((resolve, reject) => { globalThis.__finishInstall = resolve; globalThis.__cancelInstall = () => reject(Error('Installation cancelled. You can retry.')); });
      if (globalThis.__installFailure) throw Error('Installation failed: synthetic network fixture. Check your connection and retry.');
      current = { ...current, toolInstalled: true, warning: `${current.providerName} is installed. Continue with browser sign-in.` }; return current;
    });
    ipcMain.handle('recorder:cancel', () => (globalThis.__cancelLogin || globalThis.__cancelInstall)());
    ipcMain.handle('recorder:toolLogin', async (_, id, add) => {
      if (id !== current.providerId) throw Error('Wrong fixture tool');
      BrowserWindow.getAllWindows()[0].webContents.send('recorder:event', { type: 'setup', message: 'Finish signing in in your browser…' });
      try { await new Promise((resolve, reject) => { globalThis.__finishLogin = resolve; globalThis.__cancelLogin = () => reject(Error('Sign-in cancelled. You can retry.')); }); }
      finally { globalThis.__cancelLogin = undefined; }
      const account = add || !current.accounts.length ? { id: `account-${current.accounts.length + 1}`, label: `Synthetic account ${current.accounts.length + 1}`, connected: true } : { ...current.accounts.find(account => account.id === current.accountId), connected: true };
      current = { ...current, signedIn: true, accountLabel: account.label, accountId: account.id, accounts: [...current.accounts.filter(saved => saved.id !== account.id), account], models: [{ id: 'default', name: `Default from ${current.providerName}` }, { id: 'fixture-vision', name: 'Fixture vision model' }], warning: undefined }; return current;
    });
    ipcMain.handle('recorder:toolAccount', (_, id, accountId) => { if (id !== current.providerId) throw Error('Wrong fixture tool'); const account = current.accounts.find(account => account.id === accountId); current = { ...current, accountId, accountLabel: account.label, signedIn: account.connected }; return current; });
    ipcMain.handle('recorder:toolLogout', (_, id) => { if (id !== current.providerId) throw Error('Wrong fixture tool'); current = { ...current, signedIn: false, accounts: current.accounts.map(account => account.id === current.accountId ? { ...account, connected: false } : account) }; return current; });
    ipcMain.handle('recorder:manageUsage', (_, id) => { globalThis.__usageProvider = id; });
    ipcMain.handle('recorder:refreshModels', () => current);
  }, base);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const provider = page.getByRole('combobox', { name: 'Generation provider' });
  for (const [id, label] of [['claude-code', 'Claude Code'], ['kimi-code', 'Kimi Code'], ['gemini-cli', 'Antigravity CLI'], ['grok-cli', 'Grok Build']]) {
    await provider.selectOption(id);
    await expect(page.getByRole('button', { name: `Install ${label}`, exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: `Continue with ${label}`, exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toHaveCount(0);
  }
  async function capture(state) {
    for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      await app.evaluate(({ BrowserWindow }, size) => { const window = BrowserWindow.getAllWindows()[0]; window.setMinimumSize(300, 400); window.setSize(...size); }, [width, height]);
      await expect.poll(() => page.evaluate(() => innerWidth < 450)).toBe(width < 450);
      await page.evaluate(() => scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `.impeccable/review/tool-${state}-${name}.png`, fullPage: true });
    }
  }
  await capture('missing');
  await page.getByRole('button', { name: 'Install Grok Build', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Installing official Grok Build' })).toBeVisible();
  await expect(provider).toBeDisabled(); await capture('installing');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Installation cancelled');
  await expect(page.getByRole('button', { name: 'Install Grok Build', exact: true })).toBeEnabled();
  await app.evaluate(() => { globalThis.__installFailure = true; });
  await page.getByRole('button', { name: 'Install Grok Build', exact: true }).click();
  await expect(provider).toBeDisabled(); await app.evaluate(() => globalThis.__finishInstall());
  await expect(page.getByRole('alert')).toContainText('synthetic network fixture'); await capture('error');
  await app.evaluate(() => { globalThis.__installFailure = false; });
  await page.getByRole('button', { name: 'Install Grok Build', exact: true }).click();
  await expect(provider).toBeDisabled(); await app.evaluate(() => globalThis.__finishInstall());
  await expect(page.getByRole('button', { name: 'Continue with Grok Build', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Install Grok Build', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue('default'); await capture('installed');
  for (const [id, label] of [['grok-cli', 'Grok Build'], ['claude-code', 'Claude Code'], ['kimi-code', 'Kimi Code'], ['gemini-cli', 'Antigravity CLI']]) {
    if (id !== 'grok-cli') {
      await provider.selectOption(id);
      await page.getByRole('button', { name: `Install ${label}`, exact: true }).click();
      await expect(provider).toBeDisabled(); await app.evaluate(() => globalThis.__finishInstall());
    }
    const signin = page.getByRole('button', { name: `Continue with ${label}`, exact: true });
    await expect(signin).toBeEnabled(); await signin.click();
    await expect(page.getByRole('status').filter({ hasText: 'Finish signing in in your browser' })).toBeVisible();
    await expect(provider).toBeDisabled(); await app.evaluate(() => globalThis.__finishLogin());
    await expect(signin).toHaveCount(0);
    if (id === 'gemini-cli') {
      await expect(page.getByRole('combobox', { name: `${label} account`, exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Add account', exact: true })).toHaveCount(0);
      await expect(page.getByText('Antigravity replaces Gemini CLI', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: 'Manage usage', exact: true }).click();
      expect(await app.evaluate(() => globalThis.__usageProvider)).toBe(id);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(signin).toBeEnabled();
      await signin.click(); await expect(provider).toBeDisabled();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Sign-in cancelled');
      await expect(signin).toBeEnabled();
      continue;
    }
    const account = page.getByRole('combobox', { name: `${label} account`, exact: true });
    await expect(account).toHaveValue('account-1');
    await expect(account.locator('option')).toHaveText(['Synthetic account 1']);
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Model', exact: true }).locator('option')).toHaveText([`Default from ${label}`, 'Fixture vision model']);
    await page.getByRole('button', { name: 'Manage usage', exact: true }).click();
    expect(await app.evaluate(() => globalThis.__usageProvider)).toBe(id);
    await page.getByRole('button', { name: 'Add account', exact: true }).click();
    await expect(provider).toBeDisabled(); await app.evaluate(() => globalThis.__finishLogin());
    await expect(account).toHaveValue('account-2');
    await account.selectOption('account-1'); await expect(account).toHaveValue('account-1');
    await capture(`connected-${id}`);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(signin).toBeEnabled();
    await expect(account.locator('option[value="account-1"]')).toHaveText('Synthetic account 1 (signed out)');
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
    await signin.click(); await expect(provider).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Sign-in cancelled');
    await expect(signin).toBeEnabled(); await expect(account).toHaveValue('account-1');
    await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  }
  console.log('Tool Settings verified: installation, browser completion/cancel, sign-out, model choices, usage links, Claude/Kimi/Grok account switching, Antigravity native account controls, and desktop/mobile overflow.');
} finally {
  await app.evaluate(({ app }) => app.exit()); await app.close();
  expect(path.resolve(root).startsWith(path.resolve('.runtime/tool-ui-test-'))).toBe(true);
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
