const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createSettings, validate } = require('../electron/settings.cjs');

test('automatic installation is opt-in and recording preferences survive restart', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-settings-'));
  t.after(async () => { assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-settings-'))); await fs.rm(root, { recursive: true, force: true }); });
  const settings = createSettings(root);
  assert.deepEqual(await settings.get(), { autoInstall: false, additionalSkillTargets: [], shortcut: 'Control+Shift+R' });
  const detached = await settings.get(); detached.autoInstall = true;
  assert.equal((await settings.get()).autoInstall, false);
  detached.additionalSkillTargets.push('grok');
  assert.deepEqual((await settings.get()).additionalSkillTargets, []);
  await settings.save({ autoInstall: true, additionalSkillTargets: ['claude', 'grok', 'antigravity'], shortcut: 'Control+Alt+F11' });
  assert.deepEqual(await createSettings(root).get(), { autoInstall: true, additionalSkillTargets: ['claude', 'grok', 'antigravity'], shortcut: 'Control+Alt+F11' });
  await assert.rejects(settings.save({ autoInstall: 'yes', shortcut: 'R' }));
  assert.equal((await settings.get()).shortcut, 'Control+Alt+F11');
  await assert.rejects(settings.save({ autoInstall: false, saveToClaude: 'yes', shortcut: 'Control+R' }));
  await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify({ autoInstall: false, shortcut: 'Control+R' }));
  assert.deepEqual((await createSettings(root).get()).additionalSkillTargets, []);
  await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify({ autoInstall: true, saveToClaude: true, shortcut: 'Control+R' }));
  assert.deepEqual(await createSettings(root).get(), { autoInstall: true, additionalSkillTargets: ['claude'], shortcut: 'Control+R' });
  for (const additionalSkillTargets of ['claude', ['unknown'], [null]]) assert.throws(() => validate({ autoInstall: false, shortcut: 'Control+R', additionalSkillTargets }));
  assert.deepEqual(validate({ autoInstall: false, shortcut: 'Control+R', additionalSkillTargets: ['grok', 'grok'] }).additionalSkillTargets, ['grok']);
});

test('shortcuts require a deliberate modifier and reject malformed or repeated keys', () => {
  for (const shortcut of ['R', 'Shift+R', 'Control++R', 'Control+Control+R', 'Control+F25', 'Control+Space', '', 12]) assert.throws(() => validate({ autoInstall: false, shortcut }));
  for (const shortcut of ['Control+R', 'Alt+F9', 'Super+Shift+7']) assert.equal(validate({ autoInstall: false, shortcut }).shortcut, shortcut);
});
