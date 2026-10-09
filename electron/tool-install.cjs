const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { run } = require('./services.cjs');

const nodeDirectory = root => path.join(root, 'tools', 'node');
async function gitBash() {
  const candidates = [process.env.KIMI_SHELL_PATH, path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe')];
  for (const file of candidates.filter(Boolean)) if (await fs.access(file).then(() => true, () => false)) return file;
}
async function installTool(root, tool, progress, signal, { fetch: fetcher = globalThis.fetch, run: execute = run } = {}) {
  if (tool.kind === 'antigravity') {
    progress('Downloading official Antigravity CLI…');
    const platform = process.arch === 'arm64' ? 'windows_arm64' : 'windows_amd64';
    const response = await fetcher(`https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/${platform}.json`, { signal });
    if (!response.ok) throw new Error('Could not find the official Antigravity release. Retry installation.');
    const manifest = await response.json(), url = new URL(manifest.url);
    if (url.protocol !== 'https:' || url.hostname !== 'storage.googleapis.com' || !url.pathname.startsWith('/antigravity-public/antigravity-cli/')) throw new Error('Invalid Antigravity release URL.');
    const download = await fetcher(url.href, { signal });
    if (!download.ok) throw new Error('Could not download Antigravity CLI. Retry installation.');
    const buffer = Buffer.from(await download.arrayBuffer());
    if (crypto.createHash('sha512').update(buffer).digest('hex') !== manifest.sha512?.toLowerCase()) throw new Error('Antigravity download checksum mismatch. Nothing was installed.');
    signal?.throwIfAborted();
    const prefix = path.join(root, 'tools', tool.id); await fs.mkdir(prefix, { recursive: true });
    const file = path.join(prefix, 'agy.exe'); await fs.writeFile(file, buffer);
    await execute(file, ['--help'], { signal });
    progress('Antigravity CLI is installed. Continue with browser sign-in.');
    return;
  }
  const nodeRoot = nodeDirectory(root), node = path.join(nodeRoot, 'node.exe');
  const npm = path.join(nodeRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const ready = path.join(nodeRoot, 'ready');
  if (!await fs.access(ready).then(() => true, () => false)) {
    progress('Downloading the app’s Node.js runtime…');
    const index = await fetcher('https://nodejs.org/dist/index.json', { signal });
    if (!index.ok) throw new Error('Could not find the official Node.js release. Retry installation.');
    const release = (await index.json()).find(r => r.lts && /^v\d+\.\d+\.\d+$/.test(r.version) && Number(r.version.split('.')[0].slice(1)) >= 24);
    if (!release) throw new Error('No supported Node.js LTS release was found.');
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const filename = `node-${release.version}-win-${arch}.zip`, base = `https://nodejs.org/dist/${release.version}/`;
    const [download, checksums] = await Promise.all([fetcher(base + filename, { signal }), fetcher(base + 'SHASUMS256.txt', { signal })]);
    if (!download.ok || !checksums.ok) throw new Error('Could not download and verify Node.js. Retry installation.');
    const buffer = Buffer.from(await download.arrayBuffer());
    const expected = (await checksums.text()).split('\n').map(line => line.trim().split(/\s+/)).find(parts => parts[1] === filename)?.[0];
    if (!expected || crypto.createHash('sha256').update(buffer).digest('hex') !== expected) throw new Error('Node.js download checksum mismatch. Nothing was installed.');
    const zip = new (require('adm-zip'))(buffer);
    for (const entry of zip.getEntries()) {
      const relative = entry.entryName.split('/').slice(1).join('/');
      if (!relative) continue;
      const destination = path.resolve(nodeRoot, relative);
      if (!destination.startsWith(path.resolve(nodeRoot) + path.sep)) throw new Error('Invalid Node.js archive path.');
      if (entry.isDirectory) await fs.mkdir(destination, { recursive: true });
      else { await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, entry.getData()); }
    }
    await fs.access(npm); await execute(node, ['--version'], { signal });
    await fs.writeFile(ready, release.version);
  }
  if (tool.kind === 'kimi' && !await gitBash()) {
    progress('Installing Git Bash for Kimi Code…');
    await execute('winget.exe', ['install', '--id', 'Git.Git', '--exact', '--source', 'winget', '--scope', 'user', '--silent', '--accept-source-agreements', '--accept-package-agreements'], { signal });
    if (!await gitBash()) throw new Error('Git Bash was not found after installation. Install Git for Windows, then retry Kimi Code installation.');
  }
  progress(`Installing official ${tool.name}…`);
  const prefix = path.join(root, 'tools', tool.id); await fs.mkdir(prefix, { recursive: true });
  await execute(node, [npm, 'install', '--prefix', prefix, '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/', `${tool.package}@latest`], { cwd: prefix, env: { ...process.env, PATH: [nodeRoot, process.env.PATH].filter(Boolean).join(path.delimiter), ...(tool.kind === 'grok' ? { GROK_HOME: path.join(root, 'provider-workspaces', tool.id, '.grok-home') } : {}) }, signal });
  progress(`${tool.name} is installed. Continue with browser sign-in.`);
}
module.exports = { installTool, nodeDirectory, gitBash };
