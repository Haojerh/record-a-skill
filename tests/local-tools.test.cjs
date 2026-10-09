const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createLocalTools, findTool } = require('../electron/local-tools.cjs');

const draft = { markdown: '---\nname: fixture-skill\ndescription: Verify a fixture.\n---\nVerify the outcome.', uncertainties: [] };
const input = [{ type: 'input_text', text: 'Infer the task from the attached evidence.' }, { type: 'input_image', image_url: 'data:image/jpeg;base64,dGVzdA==' }];
const schema = { type: 'object' };
const fixture = `
const readline = require('node:readline');
const args = JSON.parse(process.env.FIXTURE_ARGS), kind = process.env.FIXTURE_KIND;
let loggedIn = process.env.FIXTURE_AUTH !== 'false';
const send = data => process.stdout.write(JSON.stringify({jsonrpc:'2.0',...data})+'\\n');
if (args.includes('status')) { console.log(JSON.stringify({loggedIn:true,email:'fixture@example.test'})); process.exit(0); }
readline.createInterface({input:process.stdin}).on('line', line => {
  const m=JSON.parse(line); process.send(m);
  if(kind==='claude-code') {
    if(m.type==='control_request') { console.log(JSON.stringify({type:'control_response',response:{subtype:'success',request_id:m.request_id,response:{models:[{value:'default',displayName:'Default'},{value:'live-fixture-vision',displayName:'Live fixture vision'}]}}})); return; }
    console.log(JSON.stringify({type:'assistant',message:{content:[]}})); console.log(JSON.stringify({type:'result',subtype:'success',result:JSON.stringify(${JSON.stringify(draft)})})); return;
  }
  if(m.method==='initialize') send({id:m.id,result:{protocolVersion:1,agentCapabilities:{promptCapabilities:{image:kind!=='grok-cli'}},_meta:kind==='grok-cli'?{grokShell:true}:{}}});
  if(m.method==='authenticate') { loggedIn=true; send({id:m.id,result:{}}); }
  if(m.method==='logout') { loggedIn=false; send({id:m.id,result:{}}); }
  if(m.method==='session/new') send(loggedIn ? {id:m.id,result:{sessionId:'fixture',models:{availableModels:[{modelId:'live-fixture-vision',name:'Live fixture vision'}]}}} : {id:m.id,error:{code:-32000,message:'Authentication required'}});
  if(m.method==='session/set_model') send({id:m.id,result:{}});
  if(m.method==='session/prompt') {
    if(process.env.FIXTURE_WAIT) return;
    send({id:100,method:'session/request_permission',params:{options:[]}});
    send({id:101,method:'fs/read_text_file',params:{path:'/private'}});
    send({method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:JSON.stringify(${JSON.stringify(draft)})}}}});
    setTimeout(()=>send({id:m.id,result:{stopReason:process.env.FIXTURE_STOP||'end_turn'}}),50);
  }
});
process.stdin.on('end',()=>{if(kind==='claude-code') process.exit(0)});
`;
test('official tools preserve image input, discover ACP models, disable actions, and require complete results', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-local-tools-'));
  const file = path.join(root, 'fixture.cjs'); await fs.writeFile(file, fixture);
  const requests = [], calls = []; let kind;
  const client = createLocalTools(root, {
    find: async tool => { kind = tool.id; return {}; },
    launch: (_, args, options) => {
      calls.push({ kind, args });
      const child = spawn(process.execPath, [file], { ...options, env: { ...process.env, FIXTURE_KIND: kind, FIXTURE_ARGS: JSON.stringify(args) }, stdio: ['pipe','pipe','pipe','ipc'] });
      child.on('message', m => requests.push(m)); return child;
    }
  });
  try {
    for (const id of ['claude-code','kimi-code','grok-cli']) {
      const status = await client.status(id, true); assert.equal(status.signedIn, true);
      assert.equal(status.models[1].id, 'live-fixture-vision');
      assert.deepEqual(await client.generate(id, 'default', input, schema), draft);
    }
    const claude = requests.find(m => m.type === 'user');
    assert.equal(claude.message.content[1].source.data, 'dGVzdA==');
    const args = calls.find(c => c.kind === 'claude-code' && c.args.includes('-p')).args;
    assert.equal(args[args.indexOf('--tools')+1], ''); assert.ok(args.includes('--safe-mode'));
    const prompts = requests.filter(m => m.method === 'session/prompt');
    assert.equal(prompts.length, 2); for (const m of prompts) assert.equal(m.params.prompt[1].data, 'dGVzdA==');
    assert.ok(requests.some(m => m.method === 'authenticate' && m.params.methodId === 'cached_token'));
    assert.ok(calls.some(c => c.kind === 'grok-cli' && c.args.join(' ') === 'agent stdio'));
    assert.match(await fs.readFile(path.join(root, 'provider-workspaces/grok-cli/evidence-agent.md'), 'utf8'), /tools: \[\]/);
    assert.ok(requests.some(m => m.id === 100 && m.result.outcome.outcome === 'cancelled'));
    assert.ok(requests.some(m => m.id === 101 && m.error.code === -32601));
    assert.match(await fs.readFile(path.join(root,'provider-workspaces/kimi-code/.agents/agents/agent.md'),'utf8'), /tools: \[\]/);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-local-tools-')));
    await fs.rm(root,{recursive:true,force:true});
  }
});
test('official ACP generation rejects incomplete turns and cancellation ends the subprocess', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-local-tools-'));
  const file = path.join(root, 'fixture.cjs'); await fs.writeFile(file, fixture);
  let wait = false;
  const client = createLocalTools(root, {
    find: async () => ({}),
    launch: (_, args, options) => spawn(process.execPath,[file],{...options,env:{...process.env,FIXTURE_KIND:'kimi-code',FIXTURE_ARGS:JSON.stringify(args),FIXTURE_STOP:'max_tokens',FIXTURE_WAIT:wait?'1':''},stdio:['pipe','pipe','pipe','ipc']})
  });
  try {
    await assert.rejects(client.generate('kimi-code','default',input,schema), /incomplete/);
    wait = true;
    const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),200);
    await assert.rejects(client.generate('kimi-code','default',input,schema,controller.signal)); clearTimeout(timer);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-local-tools-')));
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('Claude login waits for completion and replaces a cached signed-out status', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-local-tools-'));
  let signedIn = false, finishLogin, authChecks = 0;
  const client = createLocalTools(root, {
    find: async () => ({ executable: 'claude.exe', args: [] }),
    launch: (_, args) => {
      if (args.includes('status')) {
        authChecks++;
        return spawn(process.execPath, ['-e', `console.log(JSON.stringify({ loggedIn: ${signedIn}, email: 'fixture@example.test' }))`]);
      }
      if (args.includes('-p')) return spawn(process.execPath, ['-e', `console.log(JSON.stringify({type:'control_response',response:{request_id:'models',response:{models:[{value:'sonnet',displayName:'Fixture Sonnet'}]}}}))`]);
      assert.deepEqual(args, ['auth', 'login']);
      const child = new (require('node:events').EventEmitter)();
      child.stdout = new (require('node:stream').PassThrough)(); child.stderr = new (require('node:stream').PassThrough)(); child.stdin = new (require('node:stream').PassThrough)();
      finishLogin = () => { signedIn = true; child.emit('close', 0); };
      return child;
    }
  });
  try {
    assert.equal((await client.status('claude-code')).signedIn, false);
    let finished = false;
    const pending = client.login('claude-code').then(result => { finished = true; return result; });
    while (!finishLogin) await new Promise(resolve => setTimeout(resolve, 10));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(finished, false, 'Login must wait for the browser flow to finish');
    assert.equal(authChecks, 1, 'Do not check auth while login is still running');
    finishLogin();
    const result = await pending;
    assert.equal(result.signedIn, true);
    assert.equal(result.accountLabel, 'fixture@example.test');
    assert.equal(result.models[1].id, 'sonnet');
    assert.equal((await client.status('claude-code')).signedIn, true);
    assert.equal(authChecks, 2, 'Replace the cached status with a fresh auth check');
  } finally {
    assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-local-tools-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('official browser login launches the tool directly and explains Windows launch blocks', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-local-tools-'));
  const calls = [];
  const command = { executable: 'C:\\Tools & More\\claude.exe', args: [], env: { FIXTURE_ENV: 'preserved' } };
  const client = createLocalTools(root, {
    find: async () => command,
    launch: (tool, args, options) => {
      calls.push({ tool, args, options });
      const output = args.includes('status') ? JSON.stringify({ loggedIn: true, email: 'fixture@example.test' }) : args.includes('-p') ? JSON.stringify({ type: 'control_response', response: { request_id: 'models', response: { models: [] } } }) : '';
      return spawn(process.execPath, ['-e', `console.log(${JSON.stringify(output)})`]);
    }
  });
  try {
    await client.login('claude-code');
    const { tool, args, options } = calls[0];
    assert.equal(tool.executable, command.executable);
    assert.equal(tool.env.FIXTURE_ENV, 'preserved');
    assert.deepEqual(args, ['auth', 'login']);
    assert.equal(options.cwd, path.join(root, 'provider-workspaces', 'claude-code'));
    assert.equal(options.signal.aborted, false);
    assert.equal(await fs.access(path.join(options.cwd, 'login.cmd')).then(() => true, () => false), false);
    const blocked = createLocalTools(root, { find: async () => command, launch: () => { throw Object.assign(new Error('spawn EPERM'), { code: 'EPERM' }); } });
    await assert.rejects(blocked.login('claude-code'), /Windows blocked.*Protection history.*own terminal/);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-local-tools-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('JavaScript official tools resolve native Node for interactive login', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-local-tools-'));
  const previousPath = process.env.PATH;
  try {
    const packageRoot = path.join(root, 'node_modules', 'fixture-tool'); await fs.mkdir(packageRoot, { recursive: true });
    await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ bin: { 'fixture-tool': 'cli.js' } }));
    await fs.writeFile(path.join(packageRoot, 'cli.js'), '');
    await fs.writeFile(path.join(root, 'node.exe'), '');
    process.env.PATH = root;
    assert.deepEqual(await findTool({ command: 'fixture-tool', package: 'fixture-tool', name: 'Fixture tool' }), { executable: path.join(root, 'node.exe'), args: [path.join(packageRoot, 'cli.js')] });
    await fs.unlink(path.join(root, 'node.exe'));
    await assert.rejects(findTool({ command: 'fixture-tool', package: 'fixture-tool', name: 'Fixture tool' }), /Install Node.js/);
  } finally {
    process.env.PATH = previousPath;
    assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-local-tools-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('all official providers add, switch, persist, and sign out isolated accounts used for generation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-local-tools-'));
  const file = path.join(root, 'fixture.cjs'); await fs.writeFile(file, fixture);
  const auth = new Map(), calls = [];
  const deps = {
    find: async tool => ({ executable: process.execPath, args: [file], env: { FIXTURE_KIND: tool.id } }),
    launch: (command, args, options) => {
      const kind = command.env.FIXTURE_KIND;
      const home = command.env.CLAUDE_CONFIG_DIR || command.env.KIMI_CODE_HOME || command.env.GROK_HOME || 'default';
      const key = `${kind}:${home}`;
      const loggedIn = auth.get(key) ?? home === 'default';
      calls.push({ kind, home, args, options });
      if (args.includes('login')) { auth.set(key, true); return spawn(process.execPath, ['-e', 'process.exit(0)']); }
      if (args.includes('logout')) {
        auth.set(key, false); return spawn(process.execPath, ['-e', 'process.exit(0)']);
      }
      if (args.includes('status')) return spawn(process.execPath, ['-e', `console.log(JSON.stringify({loggedIn:${loggedIn},email:${JSON.stringify(home === 'default' ? 'first@example.test' : 'second@example.test')}}))`]);
      const child = spawn(process.execPath, [file], { ...options, env: { ...process.env, FIXTURE_KIND: kind, FIXTURE_ARGS: JSON.stringify(args), FIXTURE_AUTH: String(loggedIn) }, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
      child.on('message', message => { if (message.method === 'authenticate') auth.set(key, true); if (message.method === 'logout') auth.set(key, false); });
      return child;
    }
  };
  const client = createLocalTools(root, deps);
  try {
    for (const id of ['claude-code', 'kimi-code', 'grok-cli']) {
      const first = await client.status(id);
      assert.equal(first.signedIn, true); assert.equal(first.accounts.length, 1);
      const added = await client.login(id, undefined, true);
      assert.equal(added.signedIn, true); assert.equal(added.accounts.length, 2);
      assert.notEqual(added.accountId, first.accountId);
      assert.deepEqual(await client.generate(id, 'live-fixture-vision', input, schema), draft);
      const generation = calls.findLast(call => call.kind === id && (id === 'claude-code' ? call.args.includes('-p') : call.args.includes('acp') || call.args.includes('stdio') || call.args.includes('--experimental-acp')));
      assert.equal(generation.home, path.join(root, 'provider-accounts', id, added.accountId));
      const restarted = createLocalTools(root, deps);
      assert.equal((await restarted.status(id)).accountId, added.accountId);
      const out = await restarted.logout(id);
      assert.equal(out.signedIn, false);
      assert.equal(out.accounts.find(account => account.id === added.accountId).connected, false);
      assert.equal((await createLocalTools(root, deps).status(id)).signedIn, false);
      const switched = await restarted.selectAccount(id, first.accountId);
      assert.equal(switched.signedIn, true); assert.equal(switched.accountId, first.accountId);
      await assert.rejects(restarted.selectAccount(id, '../unknown'), /saved account/);
    }
    const metadata = await fs.readFile(path.join(root, 'local-accounts.json'), 'utf8');
    assert.doesNotMatch(metadata, /token|credential|secret/);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-local-tools-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Windows browser login preserves special characters in paths without a terminal launcher', { skip: process.platform !== 'win32', timeout: 20000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-local-tools-'));
  const cwd = path.join(root, 'space & ! % Ω'); await fs.mkdir(cwd);
  const fixtureFile = path.join(cwd, 'login fixture & ! %.cjs');
  const receipt = path.join(cwd, 'receipt.json');
  await fs.writeFile(fixtureFile, `const args=process.argv.slice(2); if(args.includes('status')) console.log(JSON.stringify({loggedIn:true})); else if(args.includes('-p')) { require('node:readline').createInterface({input:process.stdin}).on('line',()=>console.log(JSON.stringify({type:'control_response',response:{request_id:'models',response:{models:[]}}}))); } else require('node:fs').writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({ args, stdin: !!process.stdin.isTTY, stdout: !!process.stdout.isTTY }));`);
  const client = createLocalTools(cwd, { find: async () => ({ executable: process.execPath, args: [fixtureFile] }) });
  let terminal;
  try {
    await client.login('claude-code');
    for (let attempt = 0; attempt < 100; attempt++) {
      const data = await fs.readFile(receipt, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (data) { terminal = JSON.parse(data); break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(terminal, 'Sign-in terminal did not execute the fixture');
    assert.deepEqual(terminal.args, ['auth', 'login']);
    assert.equal(terminal.stdin, false); assert.equal(terminal.stdout, false);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-local-tools-')));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('cancelled or failed account addition keeps the previous account selected', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-local-tools-'));
  let hang = false;
  const client = createLocalTools(root, {
    find: async () => ({ executable: 'claude.exe', args: [] }),
    launch: (_, args, options) => {
      const script = args.includes('login') ? hang ? 'setInterval(()=>{},1000)' : 'process.exit(1)' : args.includes('status') ? 'console.log(JSON.stringify({loggedIn:true,email:"first@example.test"}))' : 'console.log(JSON.stringify({type:"control_response",response:{request_id:"models",response:{models:[]}}}))';
      return spawn(process.execPath, ['-e', script], options);
    }
  });
  try {
    const before = await client.status('claude-code');
    await assert.rejects(client.login('claude-code', undefined, true));
    assert.equal((await client.status('claude-code')).accountId, before.accountId);
    hang = true;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 150);
    await assert.rejects(client.login('claude-code', controller.signal, true), /cancelled/);
    clearTimeout(timer);
    const after = await createLocalTools(root, {
      find: async () => ({ executable: 'claude.exe', args: [] }),
      launch: (_, args, options) => spawn(process.execPath, ['-e', args.includes('status') ? 'console.log(JSON.stringify({loggedIn:true}))' : 'console.log(JSON.stringify({type:"control_response",response:{request_id:"models",response:{models:[]}}}))'], options)
    }).status('claude-code');
    assert.equal(after.accountId, before.accountId); assert.equal(after.accounts.length, 1);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-local-tools-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Claude model discovery failure keeps the authenticated account connected', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-local-tools-'));
  const client = createLocalTools(root, {
    find: async () => ({ executable: 'claude.exe', args: [] }),
    launch: (_, args, options) => spawn(process.execPath, ['-e', args.includes('status') ? 'console.log(JSON.stringify({loggedIn:true}))' : 'console.log("old tool without model initialization")'], options)
  });
  try {
    const status = await client.status('claude-code');
    assert.equal(status.signedIn, true); assert.equal(status.models.length, 1);
    assert.match(status.warning, /model choices could not be loaded.*manually/);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-local-tools-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});
