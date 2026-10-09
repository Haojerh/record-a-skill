import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Download, Plus, RefreshCw } from 'lucide-react';
import type { Checks, ProviderInput, SkillTarget } from './types';

const api = window.recorder;
const skillTargets: { id: SkillTarget; name: string; folder: string }[] = [{ id: 'claude', name: 'Claude', folder: '.claude/skills' }, { id: 'grok', name: 'Grok', folder: '.grok/skills' }, { id: 'antigravity', name: 'Antigravity', folder: '.gemini/config/skills' }];
export const shortcutLabel = (value: string) => value.replace(/Control/g, 'Ctrl').replace(/Super/g, 'Win').replace(/\+/g, ' + ');
type Props = { checks?: Checks; busy: boolean; message: string; feedback: ReactNode; onBack(): void; onLogin(newAccount?: boolean): void; onUpdate(action: () => Promise<Checks>): Promise<boolean> };

export default function Settings({ checks, busy, message, feedback, onBack, onLogin, onUpdate }: Props) {
  const [capture, setCapture] = useState(false);
  const [shortcutError, setShortcutError] = useState('');
  const [form, setForm] = useState<ProviderInput>();
  const [manualModel, setManualModel] = useState('');
  const profile = checks?.connections.find(p => p.id === checks.providerId);
  const local = checks?.localTools?.find(t => t.id === checks.providerId);
  const automaticTarget = local?.kind || profile?.kind;
  const locked = busy || !api || !checks;

  useEffect(() => {
    if (!capture) return;
    return () => { void api?.shortcutCapture(false).catch(error => setShortcutError(error.message)); };
  }, [capture]);
  useEffect(() => {
    if (!capture) return;
    window.addEventListener('keydown', recordShortcut, true);
    return () => window.removeEventListener('keydown', recordShortcut, true);
  }, [capture, checks, locked]);

  async function recordShortcut(event: KeyboardEvent) {
    if (!capture || !api || !checks) return;
    event.preventDefault(); event.stopPropagation();
    if (event.repeat || locked) return;
    if (event.key === 'Escape') { setCapture(false); setShortcutError(''); return; }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
    const key = event.key.toUpperCase();
    if ((!event.ctrlKey && !event.altKey && !event.metaKey) || !/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(key)) { setShortcutError('Use Ctrl, Alt, or Windows with a letter, number, or function key.'); return; }
    const shortcut = [...(event.ctrlKey ? ['Control'] : []), ...(event.altKey ? ['Alt'] : []), ...(event.shiftKey ? ['Shift'] : []), ...(event.metaKey ? ['Super'] : []), key].join('+');
    if (await onUpdate(() => api.settings({ ...checks.settings, shortcut }))) { setCapture(false); setShortcutError(''); }
  }
  async function captureShortcut() {
    setShortcutError('');
    if (capture) { setCapture(false); return; }
    try { await api?.shortcutCapture(true); setCapture(true); }
    catch (error) { setShortcutError((error as Error).message); }
  }
  function addConnection() {
    const kind = checks?.providerKinds[0];
    if (kind) setForm({ kind: kind.id, label: kind.name, endpoint: kind.endpoint, apiKey: '', model: '' });
  }

  return <div className="settings-page">
    <div className="page-heading"><div><h1>Settings</h1><p>Choose how recordings become skills.</p></div><button className="quiet" onClick={onBack}><ArrowLeft size={16} /> Back to recording</button></div>
    {feedback}
    {busy && <div className="notice" role="status"><span>{message || 'Updating configuration…'}</span><button className="quiet danger" onClick={() => api?.cancel()}>Cancel</button></div>}
    <section className="settings-section" aria-labelledby="recording-preferences">
      <div className="panel-heading"><h2 id="recording-preferences">Recording and installation</h2></div>
      <div className="setting-row"><div><h3>Auto install skill</h3><p>Install validated drafts into your skill folders immediately, without review. Existing skills are never overwritten.</p><small className="destination">{checks?.skillRoot || 'Your shared skill folder'}</small></div><button className="switch" role="switch" aria-label="Auto install skill" aria-checked={checks?.settings.autoInstall || false} disabled={locked} onClick={() => api && checks && onUpdate(() => api.settings({ ...checks.settings, autoInstall: !checks.settings.autoInstall }))}><span /></button></div>
      <div className="setting-row"><div className="skill-destinations"><h3 id="additional-skill-folders">Also save to</h3><p>Choose extra copies. Your shared folder and the generation provider's folder are always included.</p><div className="skill-targets" role="group" aria-labelledby="additional-skill-folders">{skillTargets.map(target => {
        const automatic = automaticTarget === target.id;
        const selected = checks?.settings.additionalSkillTargets.includes(target.id) || false;
        return <label className="skill-target" key={target.id}><input type="checkbox" aria-label={target.name} checked={automatic || selected} disabled={locked || automatic} onChange={e => { if (api && checks) void onUpdate(() => api.settings({ ...checks.settings, additionalSkillTargets: e.target.checked ? [...checks.settings.additionalSkillTargets, target.id] : checks.settings.additionalSkillTargets.filter(id => id !== target.id) })); }} /><span><strong>{target.name}</strong><small>{target.folder}{automatic && ' · Included automatically'}</small></span></label>;
      })}</div></div></div>
      <div className="setting-row"><div><h3>Start / stop recording</h3><p>Works in other apps while Record a Skill is open. Starts with your selected capture source; press again to stop and generate.</p>{capture && <p role="status">Press your new shortcut. Escape cancels.</p>}{shortcutError && <p className="shortcut-error" role="alert">{shortcutError}</p>}{checks?.shortcutWarning && <p className="shortcut-error" role="alert">{checks.shortcutWarning}</p>}</div><button className="secondary shortcut-key" aria-label="Change recording shortcut" aria-pressed={capture} disabled={locked} onClick={() => { void captureShortcut(); }}>{capture ? 'Press keys…' : shortcutLabel(checks?.settings.shortcut || 'Control+Shift+R')}</button></div>
    </section>
    <section className="settings-section" aria-labelledby="generation-accounts">
      <div className="panel-heading"><h2 id="generation-accounts">Generation and accounts</h2><button className="text-button" disabled={locked} onClick={addConnection}><Plus size={15} /> Add connection</button></div>
      <div className="settings-body">
        <div className="settings-field"><label htmlFor="generation-provider">Generation provider</label><select id="generation-provider" value={checks?.providerId || 'chatgpt'} disabled={locked} onChange={e => { setForm(undefined); setManualModel(''); void onUpdate(() => api!.provider(e.target.value)); }}><option value="chatgpt">ChatGPT · browser sign-in</option>{checks?.localTools?.map(t => <option key={t.id} value={t.id}>{t.name} · browser sign-in</option>)}{checks?.connections.map(p => <option key={p.id} value={p.id}>{p.label} · API connection</option>)}</select></div>
        {checks?.providerId === 'chatgpt' ? <div className="account-controls settings-account">
          {!!checks.accounts.length && <><label htmlFor="chatgpt-account">ChatGPT account</label><select id="chatgpt-account" value={checks.accountId} disabled={locked} onChange={e => onUpdate(() => api!.account(e.target.value))}>{checks.accounts.map(account => <option key={account.id} value={account.id}>{account.label}{account.connected ? '' : ' (signed out)'}</option>)}</select></>}
          {!checks.signedIn && <button className="chatgpt-signin" disabled={locked} onClick={() => onLogin()}><img src="./chatgpt-logo-white.svg" alt="" width={18} height={18} />Continue with ChatGPT</button>}
          {!!checks.accounts.length && <div className="account-actions"><button className="text-button" disabled={locked} onClick={() => onLogin(true)}>Add account</button>{checks.signedIn && <button className="text-button" disabled={locked} onClick={() => onUpdate(() => api!.logout())}>Sign out</button>}</div>}
          {checks.signedIn ? <div className="plan-usage"><span>Using ChatGPT plan</span><button className="text-button" onClick={() => api?.manageUsage()}>Manage usage</button></div> : <p>Authorize your ChatGPT plan in the browser. No API key or Codex CLI is needed for this connection.</p>}
        </div> : local && checks ? <div className="account-controls settings-account">
          {!local.singleAccount && !!checks.accounts.length && <><label htmlFor="tool-account">{local.name} account</label><select id="tool-account" value={checks.accountId} disabled={locked} onChange={e => onUpdate(() => api!.toolAccount(local.id, e.target.value))}>{checks.accounts.map(account => <option key={account.id} value={account.id}>{account.label}{account.connected ? '' : ' (signed out)'}</option>)}</select></>}
          {!checks.toolInstalled ? <button className="secondary" disabled={locked} onClick={() => onUpdate(() => api!.toolInstall(local.id))}><Download size={16} /> Install {local.name}</button> : !checks.signedIn && <button className="chatgpt-signin" disabled={locked} onClick={() => onUpdate(() => api!.toolLogin(local.id))}>Continue with {local.name}</button>}
          {(!!checks.accounts.length || local.singleAccount && checks.signedIn) && <div className="account-actions">{!local.singleAccount && <button className="text-button" disabled={locked} onClick={() => onUpdate(() => api!.toolLogin(local.id, true))}>Add account</button>}{checks.signedIn && <button className="text-button" disabled={locked} onClick={() => onUpdate(() => api!.toolLogout(local.id))}>Sign out</button>}</div>}
          {checks.signedIn ? <div className="plan-usage"><span>Using {local.name} account</span><button className="text-button" onClick={() => api?.manageUsage(local.id)}>Manage usage</button></div> : <p>{checks.toolInstalled ? `Authorize ${local.name} in your browser. The official tool keeps your credentials.` : `Install official ${local.name} for this app, then sign in through your browser.`}</p>}
          <div className="connection-actions"><button className="text-button" disabled={locked} onClick={() => onUpdate(() => api!.refreshModels())}>Refresh connection</button><button className="text-button" onClick={() => api?.toolDocs(local.id)}>Installation and account help</button></div>
          {local.singleAccount && <p>Antigravity replaces Gemini CLI for personal Google accounts. Sign-in and sign-out open its official terminal and browser flow. Finish setup, then close the terminal with /exit. To change Google accounts, use Antigravity CLI and refresh this connection.</p>}
        </div> : profile && <div className="connection-summary"><div><h3>{profile.label}</h3><p>{profile.endpoint}</p><small>{profile.hasKey ? 'API key saved with Windows protection' : 'Local connection without an API key'}</small></div><div className="connection-actions"><button className="text-button" disabled={locked} onClick={() => setForm({ id: profile.id, kind: profile.kind, label: profile.label, endpoint: profile.endpoint, apiKey: '', model: checks?.model || '' })}>Edit connection</button><button className="text-button danger" disabled={locked} onClick={() => onUpdate(() => api!.removeProvider(profile.id))}>Remove</button></div></div>}
        {(checks?.signedIn || local && checks?.toolInstalled) && checks && <div className="model-settings"><div className="settings-field"><label htmlFor="generation-model">Model</label><div className="model-picker"><select id="generation-model" value={checks.model} disabled={locked || !checks.models.length} onChange={e => onUpdate(() => api!.model(e.target.value))}>{!checks.models.length && <option value="">No models loaded</option>}{checks.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select><button className="icon-button" aria-label="Refresh models" disabled={locked} onClick={() => onUpdate(() => api!.refreshModels())}><RefreshCw size={16} /></button></div></div><p>{local ? 'Use the official tool’s configured default, an available model, or an exact model ID.' : 'Models are fetched from the provider. Choose one that accepts images.'}{checks.modelSource === 'manual' && ' The selected model ID was entered manually.'}</p>
          {checks.providerId !== 'chatgpt' && <details className="manual-model"><summary>Enter a model ID manually</summary><form onSubmit={async e => { e.preventDefault(); if (await onUpdate(() => api!.model(manualModel.trim(), true))) setManualModel(''); }}><label htmlFor="manual-model">Image-capable model ID</label><div className="model-picker"><input id="manual-model" value={manualModel} onChange={e => setManualModel(e.target.value)} maxLength={200} placeholder="Exact model ID from your provider" disabled={locked} required /><button className="secondary" disabled={locked || !manualModel.trim()}>Use model</button></div></form></details>}
        </div>}
        {form && <form className="provider-form" onSubmit={async e => { e.preventDefault(); if (await onUpdate(() => api!.saveProvider(form))) setForm(undefined); }}>
          <h3>{form.id ? 'Edit connection' : 'New connection'}</h3><p>API providers use their own keys and billing. Credentials stay protected on this device.</p>
          <fieldset disabled={locked}><div className="form-grid">
            <div className="settings-field"><label htmlFor="provider-kind">Provider</label><select id="provider-kind" value={form.kind} onChange={e => { const kind = checks?.providerKinds.find(k => k.id === e.target.value); if (kind) setForm({ ...form, kind: kind.id, label: kind.name, endpoint: kind.endpoint, apiKey: '', model: '' }); }}>{checks?.providerKinds.map(kind => <option key={kind.id} value={kind.id}>{kind.name}</option>)}</select></div>
            <div className="settings-field"><label htmlFor="connection-name">Connection name</label><input id="connection-name" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} maxLength={80} required /></div>
            <div className="settings-field full-field"><label htmlFor="provider-endpoint">API base URL</label><input id="provider-endpoint" type="url" value={form.endpoint} onChange={e => setForm({ ...form, endpoint: e.target.value })} placeholder="https://your-provider.example/v1" required /><p>Use your region’s endpoint. Local servers can use http://localhost.</p></div>
            <div className="settings-field full-field"><label htmlFor="provider-key">API key{form.id ? ' · leave blank to keep saved key' : form.kind === 'custom' ? ' · optional for local servers' : ''}</label><input id="provider-key" type="password" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} autoComplete="off" spellCheck={false} required={!form.id && form.kind !== 'custom'} /></div>
            <div className="settings-field full-field"><label htmlFor="provider-model">Model ID · optional</label><input id="provider-model" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} maxLength={200} placeholder="Leave blank to fetch available models" /><p>Use an image-capable model. If discovery is unavailable, enter its exact ID.</p></div>
          </div><div className="form-actions"><button className="secondary" type="submit"><Check size={16} /> Save connection</button><button className="quiet danger" type="button" onClick={() => setForm(undefined)}>Cancel</button></div></fieldset>
        </form>}
      </div>
    </section>
  </div>;
}
