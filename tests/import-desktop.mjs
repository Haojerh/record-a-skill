import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { binaries, run, importVideo } = require('../electron/services.cjs');
const root = await fs.mkdtemp(path.resolve('.runtime/import-test-'));
await fs.symlink(path.resolve('.runtime/runtime'), path.join(root, 'runtime'), 'junction');
const source = path.join(root, 'My demonstration Î©.mp4');
const corrupt = path.join(root, 'broken.mp4');
const audio = path.join(root, 'with-audio.mp4');
let app;
try {
  await run(binaries().ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=15', '-t', '3', '-pix_fmt', 'yuv420p', source]);
  await run(binaries().ffmpeg, ['-y', '-i', source, '-f', 'lavfi', '-i', 'anullsrc', '-t', '0.5', '-c:v', 'copy', '-c:a', 'aac', audio]);
  await fs.writeFile(corrupt, 'invalid video');
  await expect(importVideo(root, corrupt)).rejects.toThrow('could not be read as a video');
  await expect(importVideo(root, path.join(root, 'note.txt'))).rejects.toThrow('supported video');
  expect((await importVideo(root, audio)).microphone).toBe(true);
  const original = await fs.readFile(source);
  app = await electron.launch({ args: ['.'], env: { ...process.env, RECORD_A_SKILL_TEST_DATA: root } });
  const page = await app.firstWindow();
  await app.evaluate(({ app, dialog }, video) => {
    const require = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json');
    const services = require('./electron/services.cjs');
    const { kinds } = require('./electron/providers.cjs');
    services.configureAuth({
      status: async () => ({ signedIn: true, accountId: 'fixture', accounts: [], models: [{ id: 'fixture', name: 'Synthetic vision model' }], model: 'fixture', welcome: false, providerId: 'chatgpt', providerKind: 'chatgpt', providerName: 'ChatGPT', modelSource: 'provider', providerKinds: kinds, connections: [] }),
      generate: async input => {
        if (input.filter(item => item.type === 'input_image').length < 2 || !input[0].text.includes('No narration available.')) throw Error('Missing imported evidence');
        return { markdown: '---\nname: imported-demo\ndescription: Analyze an imported demonstration.\n---\n# Imported demonstration\nFollow and verify the demonstrated workflow.', uncertainties: ['Synthetic import fixture; no remote model called.'] };
      }
    });
    globalThis.__cancelPick = true;
    dialog.showOpenDialog = async () => globalThis.__cancelPick ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [video] };
    const save = services.saveSkill;
    services.saveSkill = (markdown, roots) => save(markdown, roots.map(dir => process.getBuiltinModule('path').join(app.getPath('userData'), 'installed-fixtures', process.getBuiltinModule('path').basename(process.getBuiltinModule('path').dirname(dir)), 'skills')));
  }, source);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Upload video', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const copy = page.getByRole('checkbox', { name: 'Claude', exact: true });
  await expect(copy).not.toBeChecked();
  await copy.click(); await expect(copy).toBeChecked();
  await expect.poll(async () => (await page.evaluate(() => window.recorder.check())).settings.additionalSkillTargets).toEqual(['claude']);
  for (const [name, id] of [['Grok', 'grok'], ['Antigravity', 'antigravity']]) { const checkbox = page.getByRole('checkbox', { name, exact: true }); await checkbox.click(); await expect.poll(async () => (await page.evaluate(() => window.recorder.check())).settings.additionalSkillTargets.includes(id)).toBe(true); await expect(checkbox).toBeChecked(); }
  const checks = await page.evaluate(() => window.recorder.check());
  expect(checks.skillRoots.map(dir => path.relative(process.env.USERPROFILE, dir))).toEqual(['.agents/skills', '.claude/skills', '.grok/skills', '.gemini/config/skills'].map(dir => path.normalize(dir)));
  async function capture(state) {
    for (const [label, width, height] of [['desktop', 1600, 900], ['mobile', 390, 844]]) {
      await app.evaluate(({ BrowserWindow }, size) => { const main = BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Record a Skill'); if (main.isMaximized()) main.unmaximize(); main.setMinimumSize(300, 400); main.setSize(...size); }, [width, height]);
      await expect.poll(() => page.evaluate(() => innerWidth < 450), { timeout: 15000 }).toBe(width < 450);
      await page.evaluate(() => scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `.impeccable/review/import-${state}-${label}.png`, fullPage: true });
    }
  }
  await capture('settings');
  await page.getByRole('button', { name: 'Back to recording' }).click();
  await capture('record');
  await page.getByRole('button', { name: 'Upload video', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Upload video', exact: true })).toBeEnabled();
  await expect(page.locator('.notice[role=status]')).toHaveCount(0);
  await app.evaluate(() => { globalThis.__cancelPick = false; });
  await page.getByRole('button', { name: 'Upload video', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make it a skill.' })).toBeVisible({ timeout: 180000 });
  await expect(page.getByLabel('Skill markdown')).toContainText('imported-demo');
  await expect(page.locator('.panel-heading .muted')).toContainText('My demonstration Î©.mp4');
  await capture('draft');
  await page.getByRole('button', { name: 'Install skill', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your skill is installed.', exact: true })).toBeVisible();
  for (const dir of ['.agents', '.claude', '.grok', 'config']) expect(await fs.readFile(path.join(root, 'installed-fixtures', dir, 'skills/imported-demo/SKILL.md'), 'utf8')).toContain('imported-demo');
  expect(await fs.readFile(source)).toEqual(original);
  const saved = JSON.parse(await fs.readFile(path.join(root, 'settings.json'), 'utf8')); expect(saved.additionalSkillTargets).toEqual(['claude', 'grok', 'antigravity']);
  console.log('Verified video picker cancellation, file validation, audio detection, real imported frame processing, Claude/Grok/Antigravity checkbox copies with ChatGPT, and source preservation.');
} finally {
  if (app) { await app.evaluate(({ app }) => app.exit()).catch(() => {}); await app.close().catch(() => {}); }
  await fs.unlink(path.join(root, 'runtime'));
  expect(path.resolve(root).startsWith(path.resolve('.runtime/import-test-'))).toBe(true);
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
