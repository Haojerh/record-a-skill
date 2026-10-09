const fs = require('node:fs/promises');
const path = require('node:path');

const defaults = { autoInstall: false, additionalSkillTargets: [], shortcut: 'Control+Shift+R' };
function validate(value) {
  if (!value || typeof value.autoInstall !== 'boolean') throw new Error('Choose whether to automatically install skills.');
  if (typeof value.shortcut !== 'string' || !/^(?:(?:Control|Alt|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(value.shortcut) || !/(?:Control|Alt|Super)\+/.test(value.shortcut)) throw new Error('Use Ctrl, Alt, or Windows with a letter, number, or function key.');
  const parts = value.shortcut.split('+');
  if (new Set(parts).size !== parts.length) throw new Error('Each shortcut key can appear only once.');
  if (value.saveToClaude !== undefined && typeof value.saveToClaude !== 'boolean') throw new Error('Choose whether to also save Claude skills.');
  const targets = value.additionalSkillTargets ?? (value.saveToClaude ? ['claude'] : []);
  if (!Array.isArray(targets) || targets.some(target => !['claude', 'grok', 'antigravity'].includes(target))) throw new Error('Choose supported additional skill folders.');
  return { autoInstall: value.autoInstall, additionalSkillTargets: [...new Set(targets)], shortcut: value.shortcut };
}
function createSettings(root) {
  const file = path.join(root, 'settings.json');
  let value;
  async function get() {
    if (!value) {
      try { value = validate(JSON.parse(await fs.readFile(file, 'utf8'))); }
      catch (error) { if (error.code !== 'ENOENT') throw error; value = { ...defaults }; }
    }
    return { ...value, additionalSkillTargets: [...value.additionalSkillTargets] };
  }
  async function save(input) {
    const next = validate(input);
    await fs.mkdir(root, { recursive: true });
    const temp = `${file}.tmp`;
    await fs.writeFile(temp, JSON.stringify(next, null, 2));
    await fs.rename(temp, file);
    value = next;
    return get();
  }
  return { get, save };
}
module.exports = { createSettings, validate, defaults };
