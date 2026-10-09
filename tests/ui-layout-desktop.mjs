import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = await fs.mkdtemp(path.resolve('.runtime/ui-layout-test-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, RECORD_A_SKILL_TEST_DATA: root } });
try {
  const page = await app.firstWindow();
  const base = await page.evaluate(() => window.recorder.check());
  await app.evaluate(({ ipcMain }, checks) => {
    globalThis.__layoutChecks = { ...checks, processor: true, providerId: 'chatgpt', providerName: 'ChatGPT', signedIn: false, accounts: [], models: [], model: '', shortcutRegistered: true, shortcutWarning: undefined };
    ipcMain.removeHandler('recorder:check');
    ipcMain.handle('recorder:check', () => globalThis.__layoutChecks);
  }, base);
  await page.reload();
  async function capture(state, settings = false) {
    if (!settings) await expect(page.locator('.source').first()).toBeVisible();
    for (const [name, width, height] of [['desktop', 1600, 900], ['mobile', 390, 844]]) {
      await app.evaluate(({ BrowserWindow }, size) => { const main = BrowserWindow.getAllWindows()[0]; main.setMinimumSize(300, 400); main.setSize(...size); }, [width, height]);
      await expect.poll(() => page.evaluate(() => innerWidth < 450)).toBe(width < 450);
      await page.evaluate(() => scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (settings) {
        const box = await page.locator('.settings-page').boundingBox();
        const viewport = await page.evaluate(() => document.documentElement.clientWidth);
        expect(Math.abs(box.x - (viewport - box.x - box.width))).toBeLessThan(2);
      }
      await page.screenshot({ path: `.impeccable/review/layout-${state}-${name}.png`, fullPage: true });
    }
  }
  const readinessRow = page.locator('.readiness > div').filter({ hasText: 'Generation provider' });
  await expect(readinessRow.getByRole('button', { name: 'Configure' })).toBeEnabled();
  await expect(page.locator('.generation-summary')).toHaveCount(0);
  await expect(page.getByText('Connect an account in Settings to generate skills.', { exact: true })).toHaveCount(0);
  await capture('unconfigured');
  await readinessRow.getByRole('button', { name: 'Configure' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const provider = page.getByRole('combobox', { name: 'Generation provider', exact: true });
  const arrow = await provider.evaluate(el => { const style = getComputedStyle(el); return { appearance: style.appearance, padding: style.paddingRight, image: style.backgroundImage, position: style.backgroundPosition }; });
  expect(arrow.appearance).toBe('none'); expect(arrow.padding).toBe('40px');
  expect(arrow.image).toContain('data:image/svg+xml'); expect(arrow.position).toContain('14px');
  await provider.focus(); await provider.press('Escape');
  await capture('settings', true);
  await app.evaluate(() => { globalThis.__layoutChecks.signedIn = true; });
  await page.reload();
  await expect(page.locator('.generation-summary')).toHaveCount(0);
  await expect(readinessRow.getByRole('button', { name: 'Configure' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeDisabled();
  await capture('missing-model');
  await app.evaluate(() => { globalThis.__layoutChecks.models = [{ id: 'fixture-model', name: 'Synthetic vision model' }]; globalThis.__layoutChecks.model = 'fixture-model'; });
  await page.reload();
  await expect(page.locator('.generation-summary')).toContainText('Synthetic vision model');
  await expect(readinessRow.getByRole('button', { name: 'Configure' })).toHaveCount(0);
  await capture('configured');
  console.log('Verified readiness Configure, hidden unconfigured summaries, selected model state, centered Settings, inset select arrows, and desktop/mobile overflow.');
} finally {
  await app.evaluate(({ app }) => app.exit()); await app.close();
  expect(path.resolve(root).startsWith(path.resolve('.runtime/ui-layout-test-'))).toBe(true);
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
