const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { installTool } = require('../electron/tool-install.cjs');
const { tools, findTool } = require('../electron/local-tools.cjs');

test('installer verifies the runtime and keeps official packages in separate app folders', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-tool-install-'));
  const zip = new AdmZip(); zip.addFile('node-v24.1.0-win-x64/node.exe', Buffer.from('fixture'));
  zip.addFile('node-v24.1.0-win-x64/node_modules/npm/bin/npm-cli.js', Buffer.from('fixture'));
  const buffer = zip.toBuffer(), hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const calls = [], messages = [];
  const controller = new AbortController();
  const fetcher = async url => url.endsWith('index.json') ? new Response(JSON.stringify([{ version: 'v24.1.0', lts: 'fixture' }])) : url.endsWith('.zip') ? new Response(buffer) : new Response(`${hash}  node-v24.1.0-win-${process.arch === 'arm64' ? 'arm64' : 'x64'}.zip\n`);
  const execute = async (command, args, options) => {
    calls.push({ command, args, options }); assert.equal(options.signal, controller.signal);
    if (args.includes('install')) {
      const tool = tools.find(t => `${t.package}@latest` === args.at(-1));
      const packageRoot = path.join(root, 'tools', tool.id, 'node_modules', tool.package); await fs.mkdir(packageRoot, { recursive: true });
      await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ bin: { [tool.command]: 'cli.js' } }));
      await fs.writeFile(path.join(packageRoot, 'cli.js'), '');
      assert.equal(args[args.indexOf('--prefix') + 1], path.join(root, 'tools', tool.id));
      if (tool.kind === 'grok') assert.equal(options.env.GROK_HOME, path.join(root, 'provider-workspaces', tool.id, '.grok-home'));
    }
    return '';
  };
  try {
    for (const id of ['claude-code', 'grok-cli']) {
      const tool = tools.find(t => t.id === id);
      await installTool(root, tool, m => messages.push(m), controller.signal, { fetch: fetcher, run: execute });
      const command = await findTool(tool, root);
      assert.equal(command.executable, path.join(root, 'tools', 'node', 'node.exe'));
      assert.ok(command.args[0].startsWith(path.join(root, 'tools', id)));
    }
    assert.equal(calls.filter(c => c.args.includes('--version')).length, 1);
    assert.equal(calls.filter(c => c.args.includes('install')).length, 2);
    assert.ok(messages.some(m => m.includes('Grok Build is installed')));
  } finally {
    assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-tool-install-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('installer rejects a corrupt runtime before extracting or running anything', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-tool-install-'));
  let ran = false;
  try {
    const fetcher = async url => url.endsWith('index.json') ? new Response(JSON.stringify([{ version: 'v24.1.0', lts: 'fixture' }])) : url.endsWith('.zip') ? new Response('corrupted download') : new Response(`${'0'.repeat(64)}  node-v24.1.0-win-${process.arch === 'arm64' ? 'arm64' : 'x64'}.zip`);
    await assert.rejects(installTool(root, tools[0], () => {}, undefined, { fetch: fetcher, run: async () => { ran = true; } }), /checksum mismatch/);
    assert.equal(ran, false);
    assert.equal(await fs.access(path.join(root, 'tools', 'node', 'ready')).then(() => true, () => false), false);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'record-tool-install-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Antigravity installs its checksum-verified native binary without Node or npm', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-antigravity-install-'));
  t.after(async () => { assert.ok(root.startsWith(path.join(os.tmpdir(),'record-antigravity-install-'))); await fs.rm(root,{recursive:true,force:true}); });
  const tool = tools.find(t => t.id === 'gemini-cli'), buffer = Buffer.from('native-fixture');
  const manifest = {url:'https://storage.googleapis.com/antigravity-public/antigravity-cli/test/windows-x64/agy.exe',sha512:crypto.createHash('sha512').update(buffer).digest('hex')};
  const requests = [], calls = [];
  const fetcher = async url => { requests.push(url); return new Response(url.endsWith('.json') ? JSON.stringify(manifest) : buffer); };
  await installTool(root,tool,()=>{},undefined,{fetch:fetcher,run:async (file,args)=>calls.push({file,args})});
  assert.equal(requests.length,2);
  const command = await findTool(tool,root);
  assert.equal(command.executable,path.join(root,'tools/gemini-cli/agy.exe')); assert.deepEqual(command.args,[]);
  assert.deepEqual(calls[0].args,['--help']);
  assert.equal(await fs.access(path.join(root,'tools/node')).then(()=>true,()=>false),false);
  manifest.sha512 = '0'.repeat(128);
  await assert.rejects(installTool(root,tool,()=>{},undefined,{fetch:fetcher,run:async()=>assert.fail('Must not execute a corrupt binary')}),/checksum mismatch/);
  assert.equal(await fs.readFile(command.executable,'utf8'),'native-fixture');
});
