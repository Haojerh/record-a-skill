const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createClient, verifyIdentity } = require('../electron/chatgpt.cjs');
const issuer = 'https://auth.openai.com';
const resource = 'https://api.openai.com/v1';
const scope = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const draft = { markdown: '---\nname: save-note\ndescription: Save a reusable note.\n---\nEnter a title, save, and verify the saved note.', uncertainties: [] };
const schema = { type: 'object', properties: { markdown: { type: 'string' }, uncertainties: { type: 'array', items: { type: 'string' } } }, required: ['markdown', 'uncertainties'], additionalProperties: false };
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

async function fixture(t, options = {}) {
  const { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } = await import('jose');
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const key = await exportJWK(publicKey); key.kid = 'test-key';
  const jwks = createLocalJWKSet({ keys: [key] });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-skill-auth-'));
  t.after(async () => { assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-skill-auth-'))); await fs.rm(root, { recursive: true, force: true }); });
  const secret = crypto.randomBytes(32);
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString: text => { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv); const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]); },
    decryptString: data => { const cipher = crypto.createDecipheriv('aes-256-gcm', secret, data.subarray(0, 12)); cipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8'); }
  };
  const calls = []; let authorize, browserResolve;
  let browserReady = new Promise(resolve => { browserResolve = resolve; });
  const sign = claims => new SignJWT({ nonce: authorize?.searchParams.get('nonce'), email: 'example@invalid.test', ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(issuer).setAudience('oaiapp_fixture').setSubject('verified-subject').setIssuedAt().setExpirationTime('1h').sign(privateKey);
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('openid-configuration')) return json({ issuer, authorization_endpoint: `${issuer}/api/accounts/authorize`, token_endpoint: `${issuer}/api/accounts/oauth/token`, jwks_uri: `${issuer}/.well-known/jwks.json`, revocation_endpoint: `${issuer}/api/accounts/oauth/revoke` });
    if (url.endsWith('/token')) {
      const form = new URLSearchParams(init.body);
      assert.equal(form.get('client_id'), 'oaiapp_fixture'); assert.equal(form.get('resource'), resource);
      assert.equal(form.has('client_secret'), false);
      if (form.get('grant_type') === 'authorization_code') {
        assert.equal(form.get('redirect_uri'), authorize.searchParams.get('redirect_uri'));
        assert.equal(crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url'), authorize.searchParams.get('code_challenge'));
      }
      const refresh = form.get('grant_type') === 'refresh_token';
      return json({ access_token: refresh ? 'rotated-access' : 'initial-access', refresh_token: refresh ? 'rotated-refresh' : 'initial-refresh', token_type: 'Bearer', expires_in: 3600, scope: options.scope ?? scope, id_token: await sign(options.claims) });
    }
    if (url.endsWith('/models')) return json({ models: options.models || [{ slug: 'hidden', visibility: 'hide' }, { slug: 'visual-model', display_name: 'Visual model', visibility: 'list' }] });
    if (url.endsWith('/revoke')) return new Response(null, { status: options.revokeFails ? 503 : 200 });
    if (url.endsWith('/responses')) {
      const body = JSON.parse(init.body);
      assert.equal(body.store, false); assert.equal(body.stream, true); assert.equal(body.model, 'visual-model');
      assert.equal(body.input[0].content[1].type, 'input_image');
      assert.equal(body.text.format.type, 'json_schema');
      assert.equal(body.tools, undefined); assert.equal(body.max_output_tokens, undefined);
      const events = [{ type: 'response.output_text.delta', delta: JSON.stringify(draft) }, ...(options.events || [{ type: 'response.completed', response: { output: [] } }])];
      const bytes = new TextEncoder().encode(events.map(event => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join(''));
      return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
    }
    throw new Error(`Unexpected mock route ${url}`);
  };
  const deps = { storage, fetch: fetcher, jwks, openBrowser: async url => { authorize = new URL(url); browserResolve(authorize); } };
  const client = createClient(root, deps);
  async function login(overrides = {}, id, signal) {
    browserReady = new Promise(resolve => { browserResolve = resolve; });
    const pending = client.login(id, signal); pending.catch(() => {});
    await browserReady;
    assert.equal(authorize.origin, issuer);
    assert.equal(authorize.searchParams.get('scope'), scope);
    const callback = new URL(authorize.searchParams.get('redirect_uri'));
    callback.search = new URLSearchParams({ code: 'test-code', client_id: 'oaiapp_fixture', state: authorize.searchParams.get('state'), ...overrides }).toString();
    const reply = await fetch(callback);
    return { reply, pending, callback, authorize };
  }
  return { client, login, calls, root, deps, sign, jwks, privateKey, getAuthorize: () => authorize };
}

test('OAuth exchanges PKCE with issued client, encrypts credentials, and reuses the host and registration', async t => {
  const f = await fixture(t);
  const first = await f.login(); assert.equal(first.reply.status, 200);
  const status = await first.pending;
  assert.equal(status.signedIn, true); assert.deepEqual(status.models, [{ id: 'visual-model', name: 'Visual model' }]);
  assert.equal(JSON.stringify(status).includes('initial-access'), false);
  const encrypted = await fs.readFile(path.join(f.root, 'chatgpt-accounts.bin'));
  assert.equal(encrypted.includes(Buffer.from('initial-refresh')), false);
  const reloaded = createClient(f.root, f.deps); assert.equal((await reloaded.status()).accountId, 'oaiapp_fixture');
  const host = first.authorize.searchParams.get('ext_agent_host_id'); assert.match(host, /^urn:uuid:/);
  const again = await f.login({}, status.accountId); await again.pending;
  assert.equal(again.authorize.searchParams.get('client_id'), 'oaiapp_fixture');
  assert.equal(again.authorize.searchParams.has('agent_name_hint'), false);
  assert.equal(again.authorize.searchParams.get('ext_agent_host_id'), host);
  assert.notEqual(again.authorize.searchParams.get('state'), first.authorize.searchParams.get('state'));
  await assert.rejects(fetch(first.callback));
  assert.equal((await f.client.acknowledge()).welcome, false);
});

test('catalog refresh replaces stale choices and keeps a selection only while it remains available', async t => {
  const options = {};
  const f = await fixture(t, options);
  const signed = await f.login(); const initial = await signed.pending;
  options.models = [{ slug: 'new-model', display_name: 'New model', visibility: 'list' }, { slug: 'visual-model', display_name: 'Visual model', visibility: 'list' }];
  const refreshed = await f.client.selectAccount(initial.accountId);
  assert.deepEqual(refreshed.models.map(m => m.id), ['new-model', 'visual-model']);
  assert.equal(refreshed.model, 'visual-model');
  options.models = [{ slug: 'new-model', display_name: 'New model', visibility: 'list' }];
  const retired = await f.client.selectAccount(initial.accountId);
  assert.equal(retired.model, 'new-model');
  const reloaded = await createClient(f.root, f.deps).status();
  assert.deepEqual(reloaded.models, retired.models);
  assert.equal(reloaded.model, 'new-model');
});

test('wrong state and returning-client substitution never exchange or save credentials', async t => {
  const f = await fixture(t);
  const bad = await f.login({ state: 'attacker-state' }); assert.equal(bad.reply.status, 400);
  await assert.rejects(bad.pending, /verified/); assert.equal(f.calls.some(c => c.url.endsWith('/token')), false);
  assert.equal((await f.client.status()).signedIn, false);
  const valid = await f.login(); await valid.pending;
  const exchanges = f.calls.filter(c => c.url.endsWith('/token')).length;
  const substitution = await f.login({ client_id: 'attacker-client' }, 'oaiapp_fixture');
  await assert.rejects(substitution.pending, /registration/);
  assert.equal(f.calls.filter(c => c.url.endsWith('/token')).length, exchanges);
  assert.equal((await f.client.status()).signedIn, true);
});

test('ID token signature, issuer, audience, expiry, and nonce are validated', async t => {
  const f = await fixture(t);
  const { SignJWT, generateKeyPair } = await import('jose');
  const other = await generateKeyPair('RS256');
  const mint = (key, claims) => new SignJWT({ sub: 'subject', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 1000, iss: issuer, aud: 'oaiapp_fixture', nonce: 'expected', ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(key);
  for (const [key, claims] of [[other.privateKey, {}], [f.privateKey, { iss: 'https://attacker.invalid' }], [f.privateKey, { aud: 'wrong-client' }], [f.privateKey, { exp: 1 }], [f.privateKey, { nonce: 'wrong' }]]) await assert.rejects(verifyIdentity(await mint(key, claims), 'oaiapp_fixture', 'expected', f.jwks));
  assert.equal((await verifyIdentity(await mint(f.privateKey, {}), 'oaiapp_fixture', 'expected', f.jwks)).sub, 'subject');
});

test('identity-only consent does not enable model requests or generation', async t => {
  const f = await fixture(t, { scope: 'openid profile email' });
  const signed = await f.login(); const status = await signed.pending;
  assert.equal(status.signedIn, false); assert.equal(status.accounts.length, 1);
  await assert.rejects(f.client.generate([], schema), /enable plan usage/);
  assert.equal(f.calls.some(c => c.url.endsWith('/models')), false);
});

test('canceling browser sign-in closes the callback listener without connecting an account', async t => {
  const f = await fixture(t); const controller = new AbortController();
  const pending = f.client.login(undefined, controller.signal); pending.catch(() => {});
  while (!f.getAuthorize()) await new Promise(resolve => setImmediate(resolve));
  const callback = f.getAuthorize().searchParams.get('redirect_uri');
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal((await f.client.status()).signedIn, false);
  await assert.rejects(fetch(callback));
});

test('streamed image evidence succeeds only after response.completed', async t => {
  const f = await fixture(t); const signed = await f.login(); await signed.pending;
  assert.deepEqual(await f.client.generate([{ type: 'input_text', text: 'Infer the task.' }, { type: 'input_image', image_url: 'data:image/jpeg;base64,Zml4dHVyZQ==' }], schema), draft);
  for (const events of [[], [{ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }], [{ type: 'error', error: { code: 'subscription_sharing_usage_limit_exceeded' } }], [{ type: 'response.incomplete' }]]) {
    const failing = await fixture(t, { events }); const signed = await failing.login(); await signed.pending;
    await assert.rejects(failing.client.generate([{ type: 'input_text', text: 'Infer' }, { type: 'input_image', image_url: 'data:image/jpeg;base64,Zg==' }], schema), /complete|usage limit/);
  }
});

test('logout revokes the renewable session, clears tokens, and retains the registration', async t => {
  for (const revokeFails of [false, true]) {
    const f = await fixture(t, { revokeFails }); const signed = await f.login(); await signed.pending;
    const status = await f.client.logout(); assert.equal(status.signedIn, false); assert.equal(status.accountId, 'oaiapp_fixture');
    assert.equal(Boolean(status.warning), revokeFails);
    const persisted = JSON.parse(f.deps.storage.decryptString(await fs.readFile(path.join(f.root, 'chatgpt-accounts.bin'))));
    assert.equal(persisted.accounts[0].accessToken, undefined); assert.equal(persisted.accounts[0].refreshToken, undefined); assert.equal(persisted.accounts[0].idToken, undefined);
    const revoke = f.calls.find(c => c.url.endsWith('/revoke'));
    assert.equal(new URLSearchParams(revoke.init.body).get('client_id'), 'oaiapp_fixture');
  }
});

test('expired access token is refreshed once and rotating credentials are saved together', async t => {
  const f = await fixture(t); const signed = await f.login(); await signed.pending;
  const file = path.join(f.root, 'chatgpt-accounts.bin');
  const state = JSON.parse(f.deps.storage.decryptString(await fs.readFile(file))); state.accounts[0].expiresAt = 0;
  await fs.writeFile(file, f.deps.storage.encryptString(JSON.stringify(state)));
  const reloaded = createClient(f.root, f.deps);
  const input = [{ type: 'input_text', text: 'Infer' }, { type: 'input_image', image_url: 'data:image/jpeg;base64,Zg==' }];
  await Promise.all([reloaded.generate(input, schema), reloaded.generate(input, schema)]);
  assert.equal(f.calls.filter(c => c.url.endsWith('/token') && new URLSearchParams(c.init.body).get('grant_type') === 'refresh_token').length, 1);
  const saved = JSON.parse(f.deps.storage.decryptString(await fs.readFile(file)));
  assert.equal(saved.accounts[0].accessToken, 'rotated-access'); assert.equal(saved.accounts[0].refreshToken, 'rotated-refresh');
});
