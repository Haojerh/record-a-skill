import { _electron as electron, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

// Explicit interactive check against OpenAI, using the app's normal protected credentials.
const app = await electron.launch({ args: ['.'] });
try {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Generation provider', exact: true }).selectOption('chatgpt');
  await expect(page.getByRole('combobox', { name: 'Generation provider', exact: true })).toBeEnabled();
  if (!(await page.evaluate(() => window.recorder.check())).signedIn) {
    await page.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click();
    console.log('Finish the OpenAI authorization in your browser, then dismiss Got it in Record a Skill.');
  }
  await expect.poll(async () => {
    const c = await page.evaluate(() => window.recorder.check());
    return c.signedIn && c.models.length > 0;
  }, { intervals: [1500], timeout: 600000 }).toBe(true);
  await expect(page.getByRole('button', { name: 'Continue with ChatGPT', exact: true })).toHaveCount(0);
  console.log('Direct ChatGPT sign-in and account-specific model catalog verified.');
  const sessions = await fs.readdir('.runtime/sessions', { withFileTypes: true });
  const candidates = [];
  for (const entry of sessions.filter(entry => entry.isDirectory())) {
    const dir = path.resolve('.runtime/sessions', entry.name);
    const session = JSON.parse(await fs.readFile(path.join(dir, 'session.json'), 'utf8'));
    if (session.sourceName === 'Workflow test') candidates.push({ dir, created: session.createdAt, frame: session.frames?.at(-1)?.file });
  }
  candidates.sort((a, b) => b.created.localeCompare(a.created));
  const sample = candidates.find(item => item.frame);
  if (!sample) throw new Error('No synthetic workflow evidence is available for the live check.');
  const frame = path.join(sample.dir, 'evidence', 'frames', sample.frame);
  const name = await app.evaluate(async ({ app, safeStorage }, imagePath) => {
    const require = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json');
    const { createClient } = require('./electron/chatgpt.cjs');
    const fs = require('node:fs/promises');
    const client = createClient(app.getPath('userData'), { storage: safeStorage });
    const result = await client.generate([{ type: 'input_text', text: 'Infer the workflow from this synthetic demonstration frame. Return a portable agent SKILL.md with YAML name and description, reusable inputs, visible steps and success checks; list missing or ambiguous actions in uncertainties. Do not execute tools or include personal information.' }, { type: 'input_image', image_url: `data:image/jpeg;base64,${(await fs.readFile(imagePath)).toString('base64')}` }], { type: 'object', additionalProperties: false, properties: { markdown: { type: 'string' }, uncertainties: { type: 'array', items: { type: 'string' } } }, required: ['markdown', 'uncertainties'] });
    return require('./electron/services.cjs').validateSkill(result.markdown).name;
  }, frame);
  console.log(`Live direct image-to-skill generation verified (${name}); no skill installed.`);
} finally { await app.evaluate(({ app }) => app.exit()); await app.close(); }
