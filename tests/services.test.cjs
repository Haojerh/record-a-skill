const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { validateSkill, saveSkill, binaries, run, skillDirectories } = require('../electron/services.cjs');
const markdown = '---\nname: weekly-report\ndescription: Create and verify a weekly report.\n---\n# Weekly report\nRead the input and verify the totals.';
test('skill validation rejects path traversal, Windows reserved names, and missing instructions', () => {
  for (const name of ['../escape', 'nul', 'com1', 'MixedName', 'a'.repeat(65)]) assert.throws(() => validateSkill(markdown.replace('weekly-report', name)));
  assert.throws(() => validateSkill('---\nname: valid-name\ndescription: valid\n---\n'));
  assert.throws(() => validateSkill('not frontmatter'));
  assert.equal(validateSkill(markdown).name, 'weekly-report');
});
test('installation creates the named skill and preserves an existing file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-skill-test-'));
  try {
    const file = await saveSkill(markdown, root);
    assert.equal(await fs.readFile(file, 'utf8'), markdown);
    await assert.rejects(saveSkill(markdown.replace('Read the input', 'Overwrite'), root), /already exists/);
    assert.equal(await fs.readFile(file, 'utf8'), markdown);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-skill-test-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});
test('bundled Windows executables are present and run', async () => {
  const b = binaries();
  for (const file of Object.values(b)) await fs.access(file);
  assert.match(await run(b.ffmpeg, ['-version']), /ffmpeg version/);
  assert.match(await run(b.ffprobe, ['-version']), /ffprobe version/);
});

test('Claude installation saves shared and Claude copies and rolls back on a duplicate', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'record-skill-test-'));
  try {
    const roots = skillDirectories('claude', home);
    assert.deepEqual(skillDirectories('chatgpt', home), [roots[0]]);
    for (const kind of ['chatgpt', 'kimi']) assert.deepEqual(skillDirectories(kind, home, ['claude']), roots);
    assert.deepEqual(skillDirectories('claude', home, ['claude']), roots);
    assert.equal(roots[1], path.join(home, '.claude', 'skills'));
    const files = (await saveSkill(markdown, roots)).split('\n');
    for (const file of files) assert.equal(await fs.readFile(file, 'utf8'), markdown);
    await fs.unlink(files[0]); await fs.rmdir(path.dirname(files[0]));
    await assert.rejects(saveSkill(markdown, roots), /already exists/);
    await assert.rejects(fs.access(files[0]), { code: 'ENOENT' });
    assert.equal(await fs.readFile(files[1], 'utf8'), markdown);
  } finally {
    assert.ok(path.resolve(home).startsWith(path.join(path.resolve(os.tmpdir()), 'record-skill-test-')));
    await fs.rm(home, { recursive: true, force: true });
  }
});

test('provider folders and checkbox copies are deduplicated and installed together', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'record-skill-test-'));
  t.after(async () => { assert.ok(path.resolve(home).startsWith(path.join(path.resolve(os.tmpdir()), 'record-skill-test-'))); await fs.rm(home, { recursive: true, force: true }); });
  const shared = path.join(home, '.agents', 'skills');
  for (const [kind, folder] of [['grok', ['.grok', 'skills']], ['antigravity', ['.gemini', 'config', 'skills']], ['gemini', ['.gemini', 'config', 'skills']]]) assert.deepEqual(skillDirectories(kind, home), [shared, path.join(home, ...folder)]);
  const roots = skillDirectories('grok', home, ['claude', 'grok', 'antigravity']);
  assert.equal(roots.length, 4);
  const files = (await saveSkill(markdown, roots)).split('\n');
  for (const file of files) assert.equal(await fs.readFile(file, 'utf8'), markdown);
  for (const file of files.slice(0, -1)) { await fs.unlink(file); await fs.rmdir(path.dirname(file)); }
  await assert.rejects(saveSkill(markdown, roots), /already exists/);
  for (const file of files.slice(0, -1)) await assert.rejects(fs.access(file), { code: 'ENOENT' });
  assert.equal(await fs.readFile(files.at(-1), 'utf8'), markdown);
});
