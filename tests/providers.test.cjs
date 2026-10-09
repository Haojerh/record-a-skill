const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createProviders, endpoint, kinds } = require('../electron/providers.cjs');
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const draft = { markdown: '---\nname: provider-note\ndescription: Save a reusable note.\n---\nSave and verify the note.', uncertainties: [] };
const schema = { type: 'object', properties: { markdown: { type: 'string' }, uncertainties: { type: 'array', items: { type: 'string' } } }, required: ['markdown', 'uncertainties'], additionalProperties: false };
const input = [{ type: 'input_text', text: 'Infer the demonstrated task from these moments.' }, { type: 'input_image', image_url: 'data:image/jpeg;base64,Zml4dHVyZQ==' }];

async function fixture(t, kind, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-providers-'));
  t.after(async () => { assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-providers-'))); await fs.rm(root, { recursive: true, force: true }); });
  const secret = crypto.randomBytes(32);
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString: text => { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', secret, iv); const data = Buffer.concat([cipher.update(text), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]); },
    decryptString: data => { const cipher = crypto.createDecipheriv('aes-256-gcm', secret, data.subarray(0, 12)); cipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString(); }
  };
  const calls = [];
  const key = kind === 'custom' ? '' : 'private-fixture-key';
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.redirect, 'error'); assert.equal(init.headers['User-Agent'], 'Record-a-Skill/1.0.0');
    if (kind === 'claude') { assert.equal(init.headers['x-api-key'], key); assert.equal(init.headers['anthropic-version'], '2023-06-01'); }
    else assert.equal(init.headers.Authorization, key ? `Bearer ${key}` : undefined);
    if (url.includes('/models')) {
      if (options.discoveryFails) return new Response('{}', { status: 404 });
      if (kind === 'qwen') return json({ output: { total: 2, models: url.includes('page_no=2') ? [{ model: 'visual-model', name: 'Fixture visual model', inference_metadata: { request_modality: ['Text', 'Image'] } }] : [{ model: 'text-model', inference_metadata: { request_modality: ['Text'] } }] } });
      if (kind === 'claude') return json({ data: url.includes('after_id=') ? [{ id: 'visual-model', display_name: 'Fixture visual model', capabilities: { image_input: { supported: true } }, max_tokens: 4096 }] : [{ id: 'text-model', capabilities: { image_input: { supported: false } } }], has_more: !url.includes('after_id='), last_id: 'text-model' });
      return json({ data: [{ id: 'text-model', input_modalities: ['text'] }, { id: 'visual-model', name: 'Fixture visual model', input_modalities: ['text', 'image'] }] });
    }
    const body = JSON.parse(init.body); assert.equal(body.model, options.model || 'visual-model');
    assert.equal(body.tools, undefined); assert.match(body.messages[0].content[0].text, /schema/);
    if (kind === 'claude') {
      assert.deepEqual(body.messages[0].content[1], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'Zml4dHVyZQ==' } });
      assert.equal(body.max_tokens, 4096);
      return json({ stop_reason: options.incomplete ? 'max_tokens' : 'end_turn', content: [{ type: 'text', text: JSON.stringify(draft) }] });
    }
    assert.equal(body.messages[0].content[1].image_url.url, input[1].image_url);
    if (options.reject) return new Response(JSON.stringify({ error: { message: `Bad request ${key}` } }), { status: 400 });
    return json({ choices: [{ finish_reason: options.incomplete ? 'length' : 'stop', message: { content: options.invalid ? 'not JSON' : `\u0060\u0060\u0060json\n${JSON.stringify(draft)}\n\u0060\u0060\u0060` } }] });
  };
  const deps = { storage, fetch: fetcher, chatgpt: { status: async () => ({ signedIn: false, accountId: '', accounts: [], models: [], model: '', welcome: false }), generate: async () => draft } };
  const client = createProviders(root, deps);
  const profile = { kind, label: `Fixture ${kind}`, endpoint: kinds.find(k => k.id === kind).endpoint || 'http://localhost:11434/v1', apiKey: key, model: options.model || '' };
  return { root, deps, client, profile, calls, key };
}

test('Qwen, Kimi, DeepSeek, Claude, and custom connections discover live models and submit image evidence', async t => {
  for (const kind of kinds.map(k => k.id)) {
    const f = await fixture(t, kind);
    const status = await f.client.saveProfile(f.profile);
    assert.equal(status.model, 'visual-model'); assert.equal(status.modelSource, 'provider');
    assert.deepEqual(status.models.map(m => m.id), ['visual-model']);
    assert.equal(status.connections[0].apiKey, undefined);
    if (f.key) { assert.equal(JSON.stringify(status).includes(f.key), false); assert.equal((await fs.readFile(path.join(f.root, 'providers.bin'))).includes(Buffer.from(f.key)), false); }
    assert.deepEqual(await f.client.generate(input, schema), draft);
    const restarted = createProviders(f.root, f.deps);
    assert.equal((await restarted.status()).providerId, status.providerId);
    assert.deepEqual(await restarted.generate(input, schema), draft);
    await assert.rejects(f.client.selectModel('text-model', true), /does not accept images/);
    if (kind === 'qwen') assert.ok(f.calls.some(c => c.url.includes('/api/v1/models?')));
    await f.client.remove(status.providerId);
    assert.equal((await restarted.select('chatgpt')).providerId, 'chatgpt');
    assert.equal((await f.client.status()).connections.length, 0);
    assert.deepEqual(await f.client.generate(input, schema), draft);
  }
});

test('manual model IDs remain explicit when a custom endpoint has no discovery', async t => {
  const f = await fixture(t, 'custom', { discoveryFails: true, model: 'local-vision' });
  const status = await f.client.saveProfile(f.profile);
  assert.match(status.warning, /Connection saved/); assert.equal(status.modelSource, 'manual');
  assert.deepEqual(await f.client.generate(input, schema), draft);
  await assert.rejects(f.client.selectModel('invented'), /available model/);
});

test('provider generation rejects truncated output, invalid JSON, and redacts credentials in errors', async t => {
  for (const [kind, options, pattern] of [['claude', { incomplete: true }, /incomplete/], ['kimi', { incomplete: true }, /incomplete/], ['deepseek', { invalid: true }, /valid JSON/], ['kimi', { reject: true }, /\[hidden\]/]]) {
    const f = await fixture(t, kind, options); await f.client.saveProfile(f.profile);
    await assert.rejects(f.client.generate(input, schema), error => { assert.match(error.message, pattern); assert.equal(error.message.includes(f.key), false); return true; });
  }
});

test('connection editing preserves keys but never forwards them to a changed server without re-entry', async t => {
  const f = await fixture(t, 'kimi'); const saved = await f.client.saveProfile(f.profile);
  const id = saved.providerId;
  await f.client.saveProfile({ ...f.profile, id, label: 'Renamed fixture', apiKey: '' });
  assert.equal((await f.client.status()).providerName, 'Renamed fixture');
  await assert.rejects(f.client.saveProfile({ ...f.profile, id, endpoint: 'https://different.invalid/v1', apiKey: '' }), /key again/);
});

test('provider endpoints reject insecure remote URLs and embedded credentials', () => {
  for (const url of ['http://remote.invalid/v1', 'file:///data', 'https://user:secret@example.com', 'https://example.com?key=secret', 'https://example.com/#secret', 'not a URL']) assert.throws(() => endpoint(url));
  assert.equal(endpoint('http://localhost:11434/v1/'), 'http://localhost:11434/v1');
  assert.equal(endpoint('https://api.example.com/v1/'), 'https://api.example.com/v1');
});
