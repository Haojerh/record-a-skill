const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { tools: localKinds } = require('./local-tools.cjs');

const kinds = [
  { id: 'qwen', name: 'Qwen', endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
  { id: 'kimi', name: 'Kimi', endpoint: 'https://api.moonshot.ai/v1' },
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1' },
  { id: 'claude', name: 'Claude', endpoint: 'https://api.anthropic.com/v1' },
  { id: 'grok', name: 'Grok', endpoint: 'https://api.x.ai/v1' },
  { id: 'custom', name: 'OpenAI-compatible', endpoint: '' }
];
function endpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a valid API base URL.'); }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error('Use an HTTPS API base URL, or HTTP for a local server.');
  return url.toString().replace(/\/$/, '');
}
function modelInfo(item) {
  const modalities = item.input_modalities || item.architecture?.input_modalities || item.inference_metadata?.request_modality;
  const vision = Array.isArray(modalities) ? modalities.some(m => m.toLowerCase() === 'image') : item.capabilities?.image_input?.supported ?? item.supports_image_in;
  return { id: item.id || item.model || item.slug, name: item.display_name || item.name || item.id || item.model || item.slug, vision, maxTokens: item.max_tokens || item.model_info?.max_output_tokens };
}
function createProviders(root, { storage, chatgpt, localTools, fetch: fetcher = globalThis.fetch }) {
  const file = path.join(root, 'providers.bin');
  let state, loading, writing = Promise.resolve();
  async function load() {
    if (loading) return loading;
    if (state) return state;
    loading = (async () => {
      if (!storage.isEncryptionAvailable()) throw new Error('Windows credential protection is unavailable.');
      try { state = JSON.parse(storage.decryptString(await fs.readFile(file))); }
      catch (error) { if (error.code !== 'ENOENT') throw new Error('Provider credentials could not be opened for this Windows account.'); }
      if (!state) state = { active: 'chatgpt', profiles: [] };
      return state;
    })().finally(() => { loading = null; });
    return loading;
  }
  function persist() {
    const saved = writing.then(async () => {
      await fs.mkdir(root, { recursive: true });
      const temp = `${file}.${crypto.randomUUID()}.tmp`;
      try { await fs.writeFile(temp, storage.encryptString(JSON.stringify(state)), { mode: 0o600 }); await fs.rename(temp, file); }
      finally { await fs.rm(temp, { force: true }); }
    });
    writing = saved.catch(() => {}); return saved;
  }
  const active = () => state.profiles.find(p => p.id === state.active);
  const available = profile => (profile?.models || []).filter(m => m.vision !== false);
  async function status() {
    await load();
    const profile = active(), local = localKinds.find(t => t.id === state.active);
    const model = state.localModels?.[local?.id] || 'default';
    const account = local ? { accountId: '', accounts: [], ...await localTools.status(local.id), model, welcome: false } : profile ? { signedIn: !!profile.apiKey || profile.kind === 'custom', accountId: '', accounts: [], models: available(profile), model: profile.model || '', welcome: false } : await chatgpt.status();
    if (local) account.models = [...account.models];
    const manualLocalModel = local && !account.models.some(m => m.id === model);
    if (manualLocalModel) account.models.push({ id: model, name: model });
    return { ...account, providerId: local?.id || profile?.id || 'chatgpt', providerKind: local?.kind || profile?.kind || 'chatgpt', providerName: local?.name || profile?.label || 'ChatGPT', modelSource: local ? manualLocalModel ? 'manual' : 'tool' : profile?.modelSource || 'provider', localTools: localKinds, providerKinds: kinds, connections: state.profiles.map(({ apiKey, ...p }) => ({ ...p, hasKey: !!apiKey })) };
  }
  async function request(profile, route, { signal, ...init } = {}) {
    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'Record-a-Skill/1.0.0', ...(profile.kind === 'claude' ? { 'x-api-key': profile.apiKey, 'anthropic-version': '2023-06-01' } : profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}), ...init.headers };
    const timeout = AbortSignal.timeout(init.method === 'POST' ? 10 * 60 * 1000 : 60000);
    const response = await fetcher(`${profile.endpoint}${route}`, { ...init, headers, redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const detail = typeof body.error?.message === 'string' ? body.error.message.split(profile.apiKey || '\0').join('[hidden]').slice(0, 400) : '';
      throw new Error(`${profile.label} request failed (${response.status}). ${response.status === 401 ? 'Check the API key in Settings.' : response.status === 429 ? 'Check the provider’s quota and rate limits, then retry.' : detail || 'Check the endpoint and select a model that supports images.'}`);
    }
    return response.json();
  }
  async function refreshModels(signal) {
    await load(); const profile = active();
    if (localKinds.some(t => t.id === state.active)) { await localTools.status(state.active, true, signal); return status(); }
    if (!profile) { const s = await chatgpt.status(); await chatgpt.selectAccount(s.accountId, signal); return status(); }
    let catalog = [], cursor = '', page = 1;
    do {
      let route = '/models';
      if (profile.kind === 'qwen') {
        const base = new URL(profile.endpoint);
        base.pathname = base.pathname.replace(/\/compatible-mode\/v1$/, '/api/v1');
        const catalogProfile = { ...profile, endpoint: base.toString().replace(/\/$/, '') };
        const data = await request(catalogProfile, `/models?capabilities=VU&page_size=100&page_no=${page}`, { signal });
        const items = data.output?.models || data.data || [];
        catalog.push(...items.map(modelInfo));
        if (catalog.length >= (data.output?.total ?? catalog.length) || !items.length) break;
        page++; continue;
      }
      if (profile.kind === 'claude') route += `?limit=100${cursor ? `&after_id=${encodeURIComponent(cursor)}` : ''}`;
      const data = await request(profile, route, { signal });
      catalog.push(...(data.data || []).map(modelInfo));
      const next = data.has_more ? data.last_id : '';
      if (next && next === cursor) throw new Error('The provider returned an invalid model catalog.');
      cursor = next;
    } while (cursor || profile.kind === 'qwen');
    profile.models = [...new Map(catalog.filter(m => typeof m.id === 'string').map(m => [m.id, m])).values()];
    if (profile.modelSource === 'manual' && !profile.models.some(m => m.id === profile.model)) profile.models.push({ id: profile.model, name: profile.model });
    if (!available(profile).some(m => m.id === profile.model)) { profile.model = available(profile)[0]?.id || ''; profile.modelSource = 'provider'; }
    await persist(); return status();
  }
  async function saveProfile(input, signal) {
    await load();
    if (!input || !kinds.some(k => k.id === input.kind) || typeof input.label !== 'string' || !input.label.trim() || input.label.length > 80 || typeof input.apiKey !== 'string' || typeof input.model !== 'string' || input.model.length > 200) throw new Error('Enter a provider, connection name, API key, and optional model ID.');
    const prior = input.id ? state.profiles.find(p => p.id === input.id) : undefined;
    if (input.id && !prior) throw new Error('That connection no longer exists.');
    const base = endpoint(input.endpoint);
    if (prior && new URL(prior.endpoint).origin !== new URL(base).origin && !input.apiKey.trim()) throw new Error('Enter an API key again when changing the server.');
    const key = input.apiKey.trim() || prior?.apiKey || '';
    if (!key && input.kind !== 'custom') throw new Error('Enter this provider’s API key.');
    const profile = { id: prior?.id || crypto.randomUUID(), kind: input.kind, label: input.label.trim(), endpoint: base, apiKey: key, model: input.model.trim(), modelSource: input.model.trim() ? 'manual' : 'provider', models: input.model.trim() ? [{ id: input.model.trim(), name: input.model.trim() }] : [] };
    state.profiles = [...state.profiles.filter(p => p.id !== profile.id), profile]; state.active = profile.id;
    await persist();
    try { return await refreshModels(signal); }
    catch (error) { if (signal?.aborted) throw error; return { ...await status(), warning: `Connection saved. ${error.message} You can enter an image-capable model ID manually.` }; }
  }
  async function select(id) {
    await load(); if (id !== 'chatgpt' && !localKinds.some(t => t.id === id) && !state.profiles.some(p => p.id === id)) throw new Error('Choose a saved provider connection.');
    state.active = id; await persist(); return status();
  }
  async function selectModel(id, manual = false) {
    await load(); const profile = active();
    if (localKinds.some(t => t.id === state.active)) {
      if (typeof id !== 'string' || !id.trim() || id.length > 200) throw new Error('Enter a model ID or choose the tool default.');
      if (!manual && !(await status()).models.some(m => m.id === id)) throw new Error('Choose an available model or enter its ID manually.');
      state.localModels ||= {}; state.localModels[state.active] = id; await persist(); return status();
    }
    if (!profile) { await chatgpt.selectModel(id); return status(); }
    if (typeof id !== 'string' || !id.trim() || id.length > 200) throw new Error('Enter a model ID.');
    const known = profile.models.find(m => m.id === id);
    if (known?.vision === false) throw new Error('That model does not accept images. Choose an image-capable model.');
    if (!manual && !known) throw new Error('Choose an available model or enter its ID manually.');
    if (!known) profile.models.push({ id, name: id });
    profile.model = id; profile.modelSource = manual ? 'manual' : 'provider'; await persist(); return status();
  }
  async function remove(id) {
    await load(); if (!state.profiles.some(p => p.id === id)) throw new Error('Choose a saved connection to remove.');
    state.profiles = state.profiles.filter(p => p.id !== id);
    if (state.active === id) state.active = 'chatgpt';
    await persist(); return status();
  }
  async function generate(input, schema, signal) {
    await load(); const profile = active();
    if (localKinds.some(t => t.id === state.active)) return localTools.generate(state.active, state.localModels?.[state.active] || 'default', input, schema, signal);
    if (!profile) return chatgpt.generate(input, schema, signal);
    if (!profile.model || !available(profile).some(m => m.id === profile.model)) throw new Error('Choose an image-capable model in Settings before generating.');
    const content = input.map(item => item.type === 'input_text' ? { type: 'text', text: `${item.text}\nReturn JSON only, with this schema: ${JSON.stringify(schema)}` } : profile.kind === 'claude' ? { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: item.image_url.split(',')[1] } } : { type: 'image_url', image_url: { url: item.image_url } });
    const data = await request(profile, profile.kind === 'claude' ? '/messages' : '/chat/completions', { method: 'POST', signal, body: JSON.stringify({ model: profile.model, messages: [{ role: 'user', content }], max_tokens: Math.min(8192, profile.models.find(m => m.id === profile.model)?.maxTokens || 8192) }) });
    const finished = profile.kind === 'claude' ? data.stop_reason === 'end_turn' : data.choices?.[0]?.finish_reason === 'stop';
    if (!finished) throw new Error(`${profile.label} returned an incomplete draft. Your recording is kept; retry with an image-capable model.`);
    const text = profile.kind === 'claude' ? (data.content || []).filter(item => item.type === 'text').map(item => item.text).join('') : data.choices[0].message.content;
    try { return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
    catch { throw new Error(`${profile.label} did not return a valid JSON skill draft. Your recording is kept; choose another model or retry.`); }
  }
  return { status, saveProfile, select, selectModel, refreshModels, remove, generate };
}
module.exports = { createProviders, endpoint, modelInfo, kinds };
