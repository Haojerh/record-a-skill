const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
const random = () => crypto.randomBytes(32).toString('base64url');

async function verifyIdentity(token, clientId, nonce, jwks) {
  const { jwtVerify } = await import('jose');
  const { payload } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: clientId, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5 });
  if (!payload.sub || payload.nonce !== nonce) throw new Error('ChatGPT sign-in identity could not be verified.');
  return payload;
}

function requestError(code, status, detail) {
  if (code === 'subscription_sharing_usage_limit_exceeded' || status === 429) return new Error('ChatGPT usage limit reached. Open Manage usage to review your plan or app limits, then retry.');
  if (code === 'subscription_sharing_usage_unavailable' || code === 'insufficient_scope') return new Error('ChatGPT plan usage is unavailable. Continue with ChatGPT to authorize an eligible plan, or check Manage usage.');
  if (status === 401 || code === 'invalid_grant') return new Error('Your ChatGPT session has expired or was disconnected. Continue with ChatGPT again.');
  return new Error(`ChatGPT request failed${status ? ` (${status})` : ''}${code ? `: ${code}` : ''}.${typeof detail === 'string' ? ` ${detail.slice(0, 500)}` : ''} Your recording is kept; retry after checking your connection and account.`);
}

// The desktop main process owns credentials; only sanitized account data reaches React.
function createClient(root, { storage, openBrowser, fetch: fetcher = globalThis.fetch, jwks } = {}) {
  const file = path.join(root, 'chatgpt-accounts.bin');
  let state, loading, refresh, writing = Promise.resolve();
  async function load() {
    if (loading) return loading;
    if (state) return state;
    loading = initialize().finally(() => { loading = null; });
    return loading;
  }
  async function initialize() {
    if (!storage.isEncryptionAvailable()) throw new Error('Windows credential protection is unavailable. Restart the app before signing in.');
    try { state = JSON.parse(storage.decryptString(await fs.readFile(file))); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Saved ChatGPT credentials could not be opened. Restore access to this Windows account.'); }
    if (!state) {
      state = { hostId: `urn:uuid:${crypto.randomUUID()}`, accounts: [], activeId: '', welcomed: false };
      await persist();
    }
    return state;
  }
  function persist() {
    const saved = writing.then(async () => {
      await fs.mkdir(root, { recursive: true });
      const temp = `${file}.${crypto.randomUUID()}.tmp`;
      try { await fs.writeFile(temp, storage.encryptString(JSON.stringify(state)), { mode: 0o600 }); await fs.rename(temp, file); }
      finally { await fs.rm(temp, { force: true }); }
    });
    writing = saved.catch(() => {});
    return saved;
  }
  async function request(url, options = {}) {
    const { timeout = 60000, ...init } = options;
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
    const response = await fetcher(url, { ...init, signal, redirect: 'error' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw requestError(typeof body.error === 'string' ? body.error : body.error?.code, response.status);
    }
    return response;
  }
  async function metadata(signal) {
    const data = await (await request(`${ISSUER}/.well-known/openid-configuration`, { signal })).json();
    if (data.issuer !== ISSUER || [data.authorization_endpoint, data.token_endpoint, data.jwks_uri, data.revocation_endpoint].some(url => !url || new URL(url).origin !== ISSUER)) throw new Error('OpenAI sign-in configuration could not be verified.');
    return data;
  }
  const connected = account => !!account?.accessToken && account.scopes.includes(PLAN_SCOPE);
  const active = () => state.accounts.find(account => account.id === state.activeId);
  async function status() {
    await load();
    const account = active();
    return { signedIn: connected(account), accountId: account?.id || '', accounts: state.accounts.map(a => ({ id: a.id, label: a.label, connected: connected(a) })), models: connected(account) ? account.models || [] : [], model: account?.model || '', welcome: connected(account) && !state.welcomed };
  }
  function tokenFields(tokens, prior) {
    if (typeof tokens.access_token !== 'string' || tokens.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(tokens.expires_in)) throw new Error('OpenAI returned an incomplete sign-in response. Continue with ChatGPT again.');
    return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || prior?.refreshToken, idToken: tokens.id_token || prior?.idToken, expiresAt: Date.now() + tokens.expires_in * 1000, scopes: typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/) : prior?.scopes || [] };
  }
  async function accessToken(signal) {
    await load();
    const account = active();
    if (!connected(account)) throw new Error('Continue with ChatGPT and enable plan usage before generating a skill.');
    if (account.expiresAt > Date.now() + 60000) return account.accessToken;
    if (!refresh) refresh = (async () => {
      if (!account.refreshToken) throw new Error('Continue with ChatGPT again to renew your session.');
      const config = await metadata(signal);
      const tokens = await (await request(config.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: account.id, refresh_token: account.refreshToken, resource: RESOURCE }), signal })).json();
      Object.assign(account, tokenFields(tokens, account));
      await persist();
      if (!connected(account)) throw requestError('insufficient_scope');
      return account.accessToken;
    })().finally(() => { refresh = null; });
    return refresh;
  }
  async function models(signal) {
    const token = await accessToken(signal);
    const data = await (await request(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${token}` }, signal })).json();
    const list = (data.models || []).filter(m => m.visibility === 'list' && typeof m.slug === 'string').map(m => ({ id: m.slug, name: m.display_name || m.slug }));
    if (!list.length) throw new Error('No models are available for this ChatGPT account. Check Manage usage or connect another eligible account.');
    const account = active(); account.models = list;
    if (!list.some(m => m.id === account.model)) account.model = list[0].id;
    await persist();
    return status();
  }
  async function login(accountId, signal) {
    signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(10 * 60 * 1000)]) : AbortSignal.timeout(10 * 60 * 1000);
    await load(); signal?.throwIfAborted();
    const selected = accountId ? state.accounts.find(a => a.id === accountId) : undefined;
    if (accountId && !selected) throw new Error('Choose a saved ChatGPT account.');
    const config = await metadata(signal);
    const attempt = { state: random(), nonce: random(), verifier: random() };
    let server, timer, rejectPending, consumed = false;
    const aborted = () => rejectPending(signal.reason);
    try {
      const pending = new Promise((resolve, reject) => {
        rejectPending = reject;
        server = http.createServer(async (req, res) => {
          const callback = new URL(req.url, 'http://127.0.0.1');
          if (req.method !== 'GET' || callback.pathname !== '/auth/callback') { res.writeHead(404); res.end(); return; }
          if (consumed) { res.writeHead(400); res.end('This sign-in attempt has already finished.'); return; }
          consumed = true;
          try {
            if (callback.searchParams.get('state') !== attempt.state) throw new Error('ChatGPT sign-in could not be verified. Please try again.');
            if (callback.searchParams.has('error')) throw new Error('ChatGPT sign-in was declined. Continue with ChatGPT when you are ready.');
            const clientId = callback.searchParams.get('client_id') || selected?.id;
            if (!clientId || clientId === 'dynamic_agent_client' || (selected && clientId !== selected.id)) throw new Error('ChatGPT registration could not be verified. Please try again.');
            const code = callback.searchParams.get('code');
            if (!code) throw new Error('ChatGPT sign-in did not return an authorization code.');
            const tokens = await (await request(config.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirect, resource: RESOURCE }), signal })).json();
            const { createRemoteJWKSet } = await import('jose');
            const identity = await verifyIdentity(tokens.id_token, clientId, attempt.nonce, jwks || createRemoteJWKSet(new URL(config.jwks_uri)));
            if (selected && identity.sub !== selected.subject) throw new Error('This sign-in belongs to a different ChatGPT account. Use Add account instead.');
            signal?.throwIfAborted();
            const previous = state.accounts.find(a => a.id === clientId);
            if (previous && previous.subject !== identity.sub) throw new Error('The ChatGPT account registration does not match.');
            const account = { ...previous, id: clientId, subject: identity.sub, label: `${identity.email || identity.name || 'ChatGPT account'} · ${clientId.slice(-6)}`, ...tokenFields(tokens) };
            state.accounts = [...state.accounts.filter(a => a.id !== clientId), account]; state.activeId = clientId;
            await persist();
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' });
            res.end('ChatGPT connected. You can close this tab and return to Record a Skill.');
            resolve();
          } catch (error) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' }); res.end('Sign-in could not be completed. Return to Record a Skill and try again.'); reject(error); }
        });
        server.on('error', reject);
        timer = setTimeout(() => reject(new Error('ChatGPT sign-in timed out. Continue with ChatGPT to try again.')), 10 * 60 * 1000);
        signal?.addEventListener('abort', aborted, { once: true });
      });
      // Attach a rejection handler before opening the browser or waiting for listen.
      pending.catch(() => {});
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      attempt.redirect = `http://127.0.0.1:${server.address().port}/auth/callback`;
      const authorize = new URL(config.authorization_endpoint);
      authorize.search = new URLSearchParams({ client_id: selected?.id || 'dynamic_agent_client', ...(selected ? { ...(selected.idToken ? { id_token_hint: selected.idToken } : {}) } : { agent_name_hint: 'Record a Skill' }), ext_agent_host_id: state.hostId, response_type: 'code', redirect_uri: attempt.redirect, scope: SCOPES, resource: RESOURCE, state: attempt.state, nonce: attempt.nonce, code_challenge_method: 'S256', code_challenge: crypto.createHash('sha256').update(attempt.verifier).digest('base64url') }).toString();
      signal?.throwIfAborted(); await openBrowser(authorize.toString()); await pending;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', aborted); server?.close(); server?.closeIdleConnections(); }
    if (connected(active())) return models(signal);
    return status();
  }
  async function selectAccount(id, signal) {
    await load();
    if (!state.accounts.some(a => a.id === id)) throw new Error('Choose a saved ChatGPT account.');
    state.activeId = id; await persist();
    return connected(active()) ? models(signal) : status();
  }
  async function selectModel(id) {
    await load(); const account = active();
    if (!account?.models?.some(m => m.id === id)) throw new Error('Choose an available ChatGPT model.');
    account.model = id; await persist(); return status();
  }
  async function logout(signal) {
    await load(); const account = active(); let warning = '';
    if (account?.refreshToken) {
      try {
        const config = await metadata(signal);
        await request(config.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: account.refreshToken, token_type_hint: 'refresh_token', client_id: account.id }), signal });
      } catch { warning = 'Signed out locally. Remote revocation was not confirmed; disconnect Record a Skill in ChatGPT Settings if needed.'; }
    }
    if (account) { delete account.accessToken; delete account.refreshToken; delete account.idToken; account.models = []; }
    await persist(); return { ...await status(), warning };
  }
  async function acknowledge() { await load(); state.welcomed = true; await persist(); return status(); }
  async function generate(input, schema, signal) {
    await models(signal);
    const token = await accessToken(signal);
    const response = await request(`${RESOURCE}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: active().model, input: [{ role: 'user', content: input }], text: { format: { type: 'json_schema', name: 'skill_draft', strict: true, schema } }, store: false, stream: true }), signal, timeout: 10 * 60 * 1000 });
    let buffer = '', output = '', completed = false;
    const decoder = new TextDecoder();
    function consume(block) {
      const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') return;
      const event = JSON.parse(data);
      if (event.type === 'response.output_text.delta') output += event.delta;
      if (event.type === 'response.completed') {
        completed = true;
        output = event.response?.output?.flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('') || output;
      }
      if (event.type === 'response.failed' || event.type === 'error') throw requestError(event.response?.error?.code || event.error?.code || event.code, undefined, event.response?.error?.message || event.error?.message || event.message);
      if (event.type === 'response.incomplete') throw new Error('ChatGPT returned an incomplete draft. Your recording is kept; retry generation.');
    }
    for await (const chunk of response.body) {
      signal?.throwIfAborted(); buffer += decoder.decode(chunk, { stream: true }).replace(/\r/g, '');
      let boundary; while ((boundary = buffer.indexOf('\n\n')) >= 0) { consume(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); }
    }
    buffer += decoder.decode(); if (buffer.trim()) consume(buffer);
    if (!completed) throw new Error('The ChatGPT connection ended before the draft was complete. Your recording is kept; retry generation.');
    return JSON.parse(output);
  }
  return { status, login, selectAccount, selectModel, logout, acknowledge, generate };
}

module.exports = { createClient, verifyIdentity, requestError };
