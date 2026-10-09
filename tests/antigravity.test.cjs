const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { createAntigravity, result } = require('../electron/antigravity.cjs');
const { parseDraft } = require('../electron/local-tools.cjs');

function collect(child, input = '') {
  return new Promise((resolve, reject) => {
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(output) : reject(new Error(error || 'Tool failed')));
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'record-antigravity-test-'));
  t.after(async () => { assert.ok(root.startsWith(path.join(os.tmpdir(), 'record-antigravity-test-'))); await fs.rm(root, {recursive:true,force:true}); });
  let signedIn = false;
  const calls = [], draft = {markdown:'Image evidence',uncertainties:[]};
  const client = createAntigravity(root, { home: root, collect, parseDraft,
    find: async () => ({executable:'agy.exe',args:[]}),
    open: async (_, cwd, prompt, signal) => { calls.push({prompt,cwd}); signal?.throwIfAborted(); signedIn = prompt === '/exit'; },
    launch: (_, args, config) => {
      calls.push({args,config});
      const value = args.includes('/usage') ? {status:signedIn?'SUCCESS':'ERROR',response:signedIn?'Usage':'',error:'Authentication required'} : undefined;
      if (value) return spawn(process.execPath,['-e',`console.log(${JSON.stringify(JSON.stringify(value))})`],config);
      if (args.includes('models')) return spawn(process.execPath,['-e','console.log("vision-fixture\\tFixture vision")'],config);
      if (options.checkGate) {
        const agent = args[args.indexOf('--agent') + 1];
        const hook = JSON.parse(require('node:fs').readFileSync(path.join(root,'.gemini/config/agents',agent,'hooks.json')));
        const encoded = hook['recording-evidence'].PreToolUse[0].hooks[0].command.split(' ').at(-1);
        const file = path.join(config.cwd,'frame-1.jpg');
        assert.equal(require('node:fs').readFileSync(file,'utf8'),'test');
        for (const [name, AbsolutePath, decision] of [['view_file',file,'allow'],['view_file',path.join(root,'private.jpg'),'deny'],['run_command',file,'deny'],['write_to_file',file,'deny']]) {
          const output = spawnSync('powershell.exe',['-NoProfile','-EncodedCommand',encoded],{input:JSON.stringify({toolCall:{name,args:{AbsolutePath}}}),encoding:'utf8',windowsHide:true});
          assert.equal(output.status,0,output.stderr); assert.equal(JSON.parse(output.stdout).decision,decision);
        }
      }
      const script = `let input=''; process.stdin.on('data',x=>input+=x); process.stdin.on('end',()=>{${options.wait ? 'setInterval(()=>{},1000);return;' : ''} const text=JSON.parse(input).message.content; const files=text.split('\\n').filter(x=>x.endsWith('.jpg')); ${options.skipImages ? '' : `for(const file of files) console.log(JSON.stringify({event:'step_update',step_update:{state:'DONE',tool_name:'view_file',tool_info:{parameters:{AbsolutePath:file}}}}));`} console.log(JSON.stringify({event:'result',result:{status:${JSON.stringify(options.fail ? 'ERROR' : 'SUCCESS')},response:JSON.stringify(${JSON.stringify(draft)}),error:'Provider refused'}}));});`;
      return spawn(process.execPath,['-e',script],config);
    }
  });
  return {client,root,calls,draft};
}
test('Antigravity browser completion, cached status, model discovery, and native session logout', async t => {
  const f = await fixture(t,{checkGate:process.platform === 'win32'});
  assert.equal((await f.client.status()).signedIn,false);
  const signed = await f.client.login();
  assert.equal(signed.signedIn,true); assert.equal(signed.accounts.length,0);
  assert.equal(signed.models[1].id,'vision-fixture');
  assert.equal(f.calls.find(c=>c.prompt).prompt,'/exit');
  await assert.rejects(f.client.login(undefined,true),/own Google account session/);
  assert.equal((await f.client.logout()).signedIn,false);
  assert.equal(f.calls.findLast(c=>c.prompt).prompt,'/logout');
});
test('Antigravity sends recording images through a scoped agent and removes temporary evidence', async t => {
  const f = await fixture(t,{checkGate:process.platform === 'win32'});
  const input = [{text:'Create a draft.'},{image_url:'data:image/jpeg;base64,dGVzdA=='}];
  assert.deepEqual(await f.client.generate('vision-fixture',input,{type:'object'}),f.draft);
  const call = f.calls.find(c=>c.args?.includes('--input-format'));
  assert.equal(call.args[call.args.indexOf('--model')+1],'vision-fixture');
  assert.equal(await fs.access(call.config.cwd).then(()=>true,()=>false),false);
  assert.deepEqual(await fs.readdir(path.join(f.root,'.gemini/config/agents')),[]);
});
test('Antigravity rejects provider errors, uninspected images, and cancels generation', async t => {
  const input = [{text:'Create a draft.'},{image_url:'data:image/jpeg;base64,dGVzdA=='}];
  for (const option of [{fail:true},{skipImages:true}]) {
    const f = await fixture(t,option);
    await assert.rejects(f.client.generate('default',input,{type:'object'}),option.fail?/Provider refused/:/did not inspect/);
  }
  const f = await fixture(t,{wait:true}), controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),300);
  try { await assert.rejects(f.client.generate('default',input,{type:'object'},controller.signal)); }
  finally { clearTimeout(timer); }
  assert.deepEqual(await fs.readdir(path.join(f.root,'.gemini/config/agents')),[]);
  assert.throws(()=>result(JSON.stringify({status:'SUCCESS',response:''})),/incomplete/);
});
