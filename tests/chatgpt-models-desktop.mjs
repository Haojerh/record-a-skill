import { _electron as electron, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = await fs.mkdtemp(path.resolve('.runtime/model-refresh-test-'));
let app;
try {
  app = await electron.launch({ args: ['.'], env: { ...process.env, RECORD_A_SKILL_TEST_DATA: root } });
  const page = await app.firstWindow();
  const initial = await page.evaluate(() => window.recorder.check());
  await app.evaluate(({ ipcMain }, checks) => {
    globalThis.__catalogRefreshes = 0;
    globalThis.__catalogFailure = false;
    globalThis.__modelChecks = { ...checks, signedIn: true, accountId: 'fixture-account', accounts: [{ id: 'fixture-account', label: 'Fixture account', connected: true }], models: [{ id: 'retired-model', name: 'Retired model' }], model: 'retired-model', welcome: false };
    ipcMain.removeHandler('recorder:check');
    ipcMain.handle('recorder:check', () => globalThis.__modelChecks);
    ipcMain.removeHandler('recorder:refreshModels');
    ipcMain.handle('recorder:refreshModels', async () => {
      globalThis.__catalogRefreshes++;
      if (globalThis.__catalogFailure) throw new Error('Model catalog is temporarily unavailable.');
      globalThis.__modelChecks = { ...globalThis.__modelChecks, models: [{ id: 'current-model', name: 'Current model' }], model: 'current-model' };
      return globalThis.__modelChecks;
    });
  }, initial);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const model = page.getByRole('combobox', { name: 'Model', exact: true });
  await expect(model).toHaveValue('current-model');
  await expect(model.locator('option')).toHaveText(['Current model']);
  expect(await app.evaluate(() => globalThis.__catalogRefreshes)).toBe(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await app.evaluate(() => { globalThis.__catalogFailure = true; });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const catalogError = page.getByRole('alert').filter({ hasText: 'Model catalog is temporarily unavailable' });
  await expect(catalogError).toBeVisible();
  await expect(model).toHaveValue('current-model');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
  expect(await app.evaluate(() => globalThis.__catalogRefreshes)).toBe(2);
  await app.evaluate(() => { globalThis.__catalogFailure = false; });
  await page.getByRole('button', { name: 'Refresh models', exact: true }).click();
  await expect(catalogError).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh models', exact: true })).toBeEnabled();
  expect(await app.evaluate(() => globalThis.__catalogRefreshes)).toBe(3);
  console.log('ChatGPT catalog verified: Settings refreshes saved models automatically, retry works, and a failed refresh keeps the connected account and last catalog.');
} finally {
  if (app) { await app.evaluate(({ app }) => app.exit()); await app.close(); }
  expect(path.resolve(root).startsWith(path.resolve('.runtime/model-refresh-test-'))).toBe(true);
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
