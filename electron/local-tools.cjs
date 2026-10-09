const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { installTool, nodeDirectory, gitBash } = require('./tool-install.cjs');
const { createAntigravity } = require('./antigravity.cjs');

const tools = [
  { id: 'claude-code', kind: 'claude', name: 'Claude Code', command: 'claude', package: '@anthropic-ai/claude-code', login: ['auth', 'login'], docs: 'https://code.claude.com/docs/en/setup' },
  { id: 'kimi-code', kind: 'kimi', name: 'Kimi Code', command: 'kimi', package: '@moonshot-ai/kimi-code', login: ['login'], docs: 'https://www.kimi.ai/help/kimi-code/cli-getting-started' },
  { id: 'gemini-cli', kind: 'antigravity', name: 'Antigravity CLI', command: 'agy', singleAccount: true, docs: 'https://www.antigravity.google/docs/cli/install/' },
  { id: 'grok-cli', kind: 'grok', name: 'Grok Build', command: 'grok', package: '@xai-official/grok', login: ['login'], docs: 'https://docs.x.ai/build/overview' }
];
async function findTool(tool, root) {
  const directories = [...(root ? [...(tool.kind === 'grok' ? [path.join(root, 'provider-workspaces', tool.id, '.grok-home', 'bin')] : []), path.join(root, 'tools', tool.id), nodeDirectory(root)] : []), ...(process.env.PATH || '').split(path.delimiter), path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.grok', 'bin'), path.join(process.env.LOCALAPPDATA || '', 'agy', 'bin'), path.join(process.env.APPDATA || '', 'npm')];
  for (const dir of directories.filter(Boolean)) {
    const executable = path.join(dir, `${tool.command}.exe`);
    if (await fs.access(executable).then(() => true, () => false)) return { executable, args: [] };
    if (!tool.package) continue;
    const packageRoot = path.join(dir, 'node_modules', tool.package);
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[tool.command];
      if (bin) {
        const file = path.resolve(packageRoot, bin); await fs.access(file);
        if (file.endsWith('.exe')) return { executable: file, args: [] };
        // Electron's GUI executable cannot provide the interactive console these CLIs need.
        for (const nodeDir of directories.filter(Boolean)) {
          const executable = path.join(nodeDir, 'node.exe');
          if (await fs.access(executable).then(() => true, () => false)) {
            const bash = tool.kind === 'kimi' ? await gitBash() : undefined;
            return { executable, args: [file], ...(root ? { env: { PATH: [nodeDirectory(root), process.env.PATH].filter(Boolean).join(path.delimiter), ...(bash ? { KIMI_SHELL_PATH: bash } : {}) } } : {}) };
          }
        }
        throw new Error(`Install Node.js and restart Record a Skill to use ${tool.name}.`);
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  throw new Error(`Install ${tool.name} first, then restart Record a Skill or refresh the connection.`);
}
function launchProcess(command, args, options = {}) {
  return spawn(command.executable, [...command.args, ...args], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], ...options, env: { ...process.env, ...command.env, ...options.env } });
}
function collect(child, input = '') {
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-2000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `Official tool exited with code ${code}.`)));
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}
class ACP {
  constructor(child) {
    this.child = child; this.pending = new Map(); this.next = 0; this.text = '';
    this.exited = new Promise(resolve => child.once('close', resolve));
    this.lines = createInterface({ input: child.stdout });
    this.lines.on('line', line => {
      let event; try { event = JSON.parse(line); } catch { return; }
      if (event.method && event.id !== undefined) {
        this.send(event.method === 'session/request_permission' ? { id: event.id, result: { outcome: { outcome: 'cancelled' } } } : { id: event.id, error: { code: -32601, message: 'File and terminal operations are disabled.' } });
      } else if (event.method === 'session/update') {
        const update = event.params?.update;
        if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') this.text += update.content.text;
      } else if (this.pending.has(event.id)) {
        const request = this.pending.get(event.id); this.pending.delete(event.id);
        if (event.error) request.reject(new Error(event.error.message || 'Official tool request failed.')); else request.resolve(event.result);
      }
    });
    const fail = error => { this.closed = error; for (const p of this.pending.values()) p.reject(error); this.pending.clear(); };
    child.on('error', fail); child.on('close', code => fail(new Error(`Official tool closed (${code}). Check its installation and browser sign-in.`)));
    child.stdin.on('error', fail); child.stderr.resume();
  }
  send(data) { this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...data }) + '\n'); }
  call(method, params) {
    if (this.closed) return Promise.reject(this.closed);
    return new Promise((resolve, reject) => { const id = ++this.next; this.pending.set(id, { resolve, reject }); this.send({ id, method, params }); });
  }
  async close() { this.child.kill(); await this.exited; this.lines.close(); }
}
function parseDraft(text) {
  try { return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error('The official tool did not return a valid JSON skill draft. Your recording is kept; retry or change models.'); }
}
function createLocalTools(root, { find = tool => findTool(tool, root), launch = launchProcess, install = installTool } = {}) {
  const cache = new Map();
  const antigravity = createAntigravity(root, { find, launch, collect, parseDraft });
  const accountsFile = path.join(root, 'local-accounts.json');
  let accounts, loadingAccounts;
  async function loadAccounts() {
    if (!loadingAccounts) loadingAccounts = fs.readFile(accountsFile, 'utf8').then(text => { accounts = JSON.parse(text); }, error => { if (error.code !== 'ENOENT') throw error; accounts = {}; });
    await loadingAccounts;
    return accounts;
  }
  async function saveAccounts() {
    await fs.mkdir(root, { recursive: true });
    const temp = `${accountsFile}.tmp`;
    await fs.writeFile(temp, JSON.stringify(accounts));
    await fs.rename(temp, accountsFile);
  }
  async function accountCommand(tool) {
    const command = await find(tool), state = (await loadAccounts())[tool.id];
    if (!state?.active || state.active === 'default') return command;
    const home = path.join(root, 'provider-accounts', tool.id, state.active);
    await fs.mkdir(home, { recursive: true });
    const key = { claude: 'CLAUDE_CONFIG_DIR', kimi: 'KIMI_CODE_HOME', grok: 'GROK_HOME' }[tool.kind];
    const authEnv = { claude: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'], kimi: ['KIMI_API_KEY', 'MOONSHOT_API_KEY'], grok: ['XAI_API_KEY'] }[tool.kind];
    return { ...command, env: { ...command.env, ...Object.fromEntries(authEnv.map(name => [name, undefined])), [key]: home } };
  }
  async function workspace(tool) {
    const cwd = path.join(root, 'provider-workspaces', tool.id);
    await fs.mkdir(cwd, { recursive: true });
    if (tool.kind === 'kimi') {
      const dir = path.join(cwd, '.agents', 'agents'); await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'agent.md'), '---\nname: agent\ndescription: Analyze recording evidence only.\noverride: true\ntools: []\nsubagents: []\n---\nAnalyze supplied images and text. Return the requested JSON draft. Do not perform actions.');
    }
    if (tool.kind === 'grok') {
      await fs.mkdir(path.join(cwd, '.grok-home'), { recursive: true });
      await fs.writeFile(path.join(cwd, 'evidence-agent.md'), '---\nname: recording-evidence\ndescription: Analyze supplied recording evidence.\ntools: []\n---\nReturn the requested JSON skill draft. Do not perform actions.');
    }
    return cwd;
  }
  function grokEnvironment(cwd) {
    return { GROK_HOME: path.join(cwd, '.grok-home'), GROK_AGENT: path.join(cwd, 'evidence-agent.md'), GROK_DISABLE_AUTOUPDATER: '1', GROK_MEMORY: '0', GROK_SUBAGENTS: '0', GROK_CLAUDE_SKILLS_ENABLED: '0', GROK_CLAUDE_RULES_ENABLED: '0', GROK_CLAUDE_AGENTS_ENABLED: '0', GROK_CLAUDE_MCPS_ENABLED: '0', GROK_CLAUDE_HOOKS_ENABLED: '0', GROK_CURSOR_SKILLS_ENABLED: '0', GROK_CURSOR_RULES_ENABLED: '0', GROK_CURSOR_AGENTS_ENABLED: '0', GROK_CURSOR_MCPS_ENABLED: '0', GROK_CURSOR_HOOKS_ENABLED: '0' };
  }
  async function connect(tool, signal) {
    const command = await accountCommand(tool), cwd = await workspace(tool);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const rpc = new ACP(launch(command, tool.kind === 'kimi' ? ['acp'] : ['agent', 'stdio'], { cwd, env: { ...(tool.kind === 'grok' ? grokEnvironment(cwd) : {}), ...command.env }, signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal }));
    try {
      const init = await rpc.call('initialize', { protocolVersion: 1, clientInfo: { name: 'record-a-skill', version: '1.0.0' }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
      // Grok Build's published V1 parser accepts image blocks, but its handshake omits the image flag.
      if (!init.agentCapabilities?.promptCapabilities?.image && !(tool.kind === 'grok' && init._meta?.grokShell)) throw new Error('This official tool version does not accept image evidence. Update it before recording.');
      if (tool.kind === 'grok') await rpc.call('authenticate', { methodId: 'cached_token', _meta: { headless: true } });
      const session = await rpc.call('session/new', { cwd, mcpServers: [] });
      return { rpc, session };
    } catch (error) { await rpc.close(); throw error; }
    finally { clearTimeout(timer); }
  }
  async function status(id, refresh = false, signal) {
    if (id === 'gemini-cli') return antigravity.status(refresh, signal);
    const tool = tools.find(t => t.id === id);
    if (!tool) throw new Error('Choose an official tool.');
    if (!refresh && cache.has(id)) return cache.get(id);
    let result, installed = false;
    try {
      const command = await accountCommand(tool);
      installed = true;
      if ((await loadAccounts())[id]?.signedOut) result = { signedIn: false, models: [] };
      else if (tool.kind === 'claude') {
        const auth = JSON.parse(await collect(launch(command, ['auth', 'status'], { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) })));
        result = { signedIn: !!auth.loggedIn, accountLabel: auth.email || 'Claude Code account', models: [] };
        if (result.signedIn) {
          try {
            const request = { type: 'control_request', request_id: 'models', request: { subtype: 'initialize' } };
            const output = await collect(launch(command, ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--tools', '', '--safe-mode', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--no-session-persistence'], { cwd: await workspace(tool), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }), JSON.stringify(request) + '\n');
            const reply = output.trim().split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).find(message => message?.type === 'control_response' && message.response?.request_id === request.request_id);
            if (!Array.isArray(reply?.response?.response?.models)) throw new Error('Claude Code did not return model choices.');
            result.models = reply.response.response.models.filter(model => typeof model.value === 'string' && model.value !== 'default').map(model => ({ id: model.value, name: model.displayName || model.value }));
          } catch (error) {
            if (signal?.aborted) throw error;
            result.warning = 'Signed in, but Claude Code model choices could not be loaded. Refresh connection or enter a model ID manually.';
          }
        }
      } else {
        const { rpc, session } = await connect(tool, signal);
        result = { signedIn: true, accountLabel: `Account managed by ${tool.name}`, models: (session.models?.availableModels || []).map(m => ({ id: m.modelId, name: m.name || m.modelId })) };
        await rpc.close();
      }
    } catch (error) { if (signal?.aborted) throw error; result = { signedIn: false, warning: `${error.message} Complete browser sign-in in ${tool.name}, then refresh.`, models: [] }; }
    result.toolInstalled = installed;
    result.models.unshift({ id: 'default', name: `Default from ${tool.name}` });
    const registry = await loadAccounts();
    const saved = registry[id] ||= { active: 'default', accounts: [] };
    let account = saved.accounts.find(account => account.id === saved.active);
    if (result.signedIn && !account) { account = { id: saved.active, label: tool.kind === 'claude' ? result.accountLabel : `${tool.name} account ${saved.accounts.length + 1}`, connected: true }; saved.accounts.push(account); }
    if (account) {
      account.connected = result.signedIn;
      if (result.signedIn && tool.kind === 'claude') account.label = result.accountLabel;
      result.accountLabel = account.label;
    }
    result.accountId = saved.active;
    result.accounts = saved.accounts.map(account => ({ ...account }));
    await saveAccounts();
    cache.set(id, result); return result;
  }
  async function login(id, signal, newAccount = false) {
    if (id === 'gemini-cli') return antigravity.login(signal, newAccount);
    const tool = tools.find(t => t.id === id);
    if (!tool) throw new Error('Choose an official tool.');
    const registry = await loadAccounts(), saved = registry[id] ||= { active: 'default', accounts: [] };
    const previous = saved.active, wasSignedOut = saved.signedOut;
    saved.signedOut = false;
    if (newAccount) saved.active = crypto.randomUUID();
    cache.delete(id);
    try {
      const timeout = AbortSignal.timeout(10 * 60 * 1000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const command = await accountCommand(tool), cwd = await workspace(tool);
      await collect(launch(command, tool.login, { cwd, env: { ...(tool.kind === 'grok' ? grokEnvironment(cwd) : {}), ...command.env }, signal: combined }));
      const result = await status(id, true, combined);
      if (!result.signedIn) throw new Error(`${tool.name} sign-in did not complete. Please try again.`);
      return result;
    } catch (error) {
      saved.active = previous; saved.signedOut = wasSignedOut; cache.delete(id); await saveAccounts();
      if (error.name === 'AbortError') throw new Error(signal?.aborted ? `${tool.name} sign-in was cancelled. You can retry.` : `${tool.name} sign-in timed out. Please try again.`);
      if (error.code === 'EPERM' || error.code === 'EACCES') throw new Error(`Windows blocked the ${tool.name} sign-in launcher. Check Windows Security Protection history. You can also sign in using the official tool in your own terminal, then press Refresh connection.`);
      throw error;
    }
  }
  async function selectAccount(id, accountId, signal) {
    if (id === 'gemini-cli') throw new Error('Change Google accounts in Antigravity CLI, then refresh this connection.');
    const saved = (await loadAccounts())[id];
    if (!saved?.accounts.some(account => account.id === accountId)) throw new Error('Choose a saved account.');
    saved.active = accountId; saved.signedOut = !saved.accounts.find(account => account.id === accountId).connected; cache.delete(id); await saveAccounts();
    return status(id, true, signal);
  }
  async function logout(id, signal) {
    if (id === 'gemini-cli') return antigravity.logout(signal);
    const tool = tools.find(tool => tool.id === id);
    if (!tool) throw new Error('Choose an official tool.');
    const command = await accountCommand(tool), cwd = await workspace(tool);
    const timeout = AbortSignal.timeout(60000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    if (tool.kind === 'kimi') {
      const { rpc } = await connect(tool, combined);
      try { await rpc.call('logout', {}); } finally { await rpc.close(); }
    } else {
      await collect(launch(command, tool.kind === 'claude' ? ['auth', 'logout'] : ['logout'], { cwd, env: { ...(tool.kind === 'grok' ? grokEnvironment(cwd) : {}), ...command.env }, signal: combined }));
    }
    const saved = (await loadAccounts())[id];
    if (saved) saved.signedOut = true;
    cache.delete(id); await saveAccounts();
    return status(id, true, combined);
  }
  async function generate(id, model, input, schema, signal) {
    if (id === 'gemini-cli') return antigravity.generate(model, input, schema, signal);
    const tool = tools.find(t => t.id === id);
    const timeout = AbortSignal.timeout(10 * 60 * 1000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const text = `${input[0].text}\nReturn JSON only, with this schema: ${JSON.stringify(schema)}`;
    if (tool.kind === 'claude') {
      const command = await accountCommand(tool), cwd = await workspace(tool);
      const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--tools', '', '--disallowedTools', 'mcp__*', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--no-session-persistence', '--safe-mode'];
      if (model !== 'default') args.push('--model', model);
      const content = [{ type: 'text', text }, ...input.slice(1).map(item => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: item.image_url.split(',')[1] } }))];
      const output = await collect(launch(command, args, { cwd, signal: combined }), JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n');
      const result = output.trim().split('\n').map(line => JSON.parse(line)).findLast(event => event.type === 'result');
      if (!result || result.is_error || result.subtype !== 'success') throw new Error(result?.result || 'Claude Code returned an incomplete draft.');
      return parseDraft(result.result);
    }
    const { rpc, session } = await connect(tool, combined);
    try {
      if (model !== 'default') await rpc.call('session/set_model', { sessionId: session.sessionId, modelId: model });
      const prompt = [{ type: 'text', text }, ...input.slice(1).map(item => ({ type: 'image', mimeType: 'image/jpeg', data: item.image_url.split(',')[1] }))];
      const result = await rpc.call('session/prompt', { sessionId: session.sessionId, prompt });
      if (result.stopReason !== 'end_turn') throw new Error('The official tool returned an incomplete draft. Your recording is kept.');
      return parseDraft(rpc.text);
    } finally { await rpc.close(); }
  }
  async function installOfficialTool(id, progress, signal) {
    const tool = tools.find(t => t.id === id);
    if (!tool) throw new Error('Choose an official tool.');
    await install(root, tool, progress, signal); await find(tool);
    if (id === 'gemini-cli') antigravity.invalidate();
    cache.delete(id);
    return { warning: `${tool.name} is installed. Sign in through its browser flow, then refresh the connection.` };
  }
  return { status, login, selectAccount, logout, generate, install: installOfficialTool };
}
module.exports = { createLocalTools, tools, ACP, findTool, parseDraft };
