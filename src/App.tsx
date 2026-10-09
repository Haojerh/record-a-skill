import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Circle, Download, FileText, FolderOpen, Mic, MicOff, Monitor, Pause, Play, RefreshCw, Settings as SettingsIcon, Square, Upload, Video, X, WandSparkles } from 'lucide-react';
import type { Checks, Event, Session, Source, Status } from './types';
import Settings, { shortcutLabel } from './Settings';

const api = window.recorder;
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
type Stage = 'idle' | 'recording' | 'saving' | 'frames' | 'generating' | 'ready' | 'error';

function Toolbar() {
  const [status, setStatus] = useState<Status>({ elapsed: 0, paused: false, microphone: true });
  useEffect(() => api?.subscribe(event => { if (event.type === 'status') setStatus(event as Event & Status); }), []);
  return <div className="toolbar"><div className={`record-light ${status.paused ? 'paused' : ''}`} /><span className="timer">{clock(status.elapsed)}</span><span className="toolbar-label">{status.paused ? 'Paused' : 'Recording'}</span>
    <button className="icon-button" aria-label={status.microphone ? 'Mute microphone' : 'Unmute microphone'} onClick={() => api?.command('microphone')}>{status.microphone ? <Mic /> : <MicOff />}</button>
    <button className="icon-button" aria-label={status.paused ? 'Resume recording' : 'Pause recording'} onClick={() => api?.command('pause')}>{status.paused ? <Play /> : <Pause />}</button>
    <button className="stop-button" onClick={() => api?.command('stop')}><Square size={14} fill="currentColor" /> Stop</button></div>;
}

export default function App() {
  if (location.hash === '#toolbar') return <Toolbar />;
  return <Console />;
}

function Console() {
  const [page, setPage] = useState<'record' | 'settings'>('record');
  const [checks, setChecks] = useState<Checks>();
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [sourceType, setSourceType] = useState<'screen' | 'window'>('screen');
  const [microphone, setMicrophone] = useState(true);
  const [stage, setStage] = useState<Stage>('idle');
  const [session, setSession] = useState<Session>();
  const [markdown, setMarkdown] = useState('');
  const [tab, setTab] = useState<'skill' | 'narration'>('skill');
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState('');
  const [activeFrame, setActiveFrame] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const tracks = useRef<MediaStreamTrack[]>([]);
  const audio = useRef<MediaStreamTrack | null>(null);
  const writes = useRef(Promise.resolve());
  const writeError = useRef<Error | null>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const live = useRef<HTMLVideoElement>(null);
  const tickStart = useRef(0);
  const accrued = useRef(0);
  const controls = useRef({ start: () => {}, stop: () => {}, pause: () => {}, microphone: () => {} });
  const active = stage === 'recording';
  const processing = ['saving', 'frames', 'generating'].includes(stage);
  const accountEditable = stage === 'idle' || stage === 'error';
  const currentStep = installed ? 3 : stage === 'ready' ? 2 : ['frames', 'generating', 'error'].includes(stage) ? 1 : 0;
  const autoInstalled = !!session?.installed;
  const stepLabels = ['Record workflow', 'Prepare evidence', 'Review & install'];
  const providerName = checks?.providerName || 'ChatGPT';
  const generationModel = checks?.models.find(model => model.id === checks.model);
  const generationReady = !!checks?.signedIn && !!generationModel;
  const stepDetails = [active ? paused ? 'Recording paused' : 'Recording in progress' : stage === 'saving' ? 'Saving recording' : currentStep > 0 ? 'Recording saved' : 'Choose what to record', currentStep > 1 ? 'Evidence prepared' : stage === 'generating' ? `${providerName} is drafting your skill` : stage === 'error' ? 'Processing needs attention' : 'Frames and narration', installed ? 'Skill installed' : 'Edit and save SKILL.md'];
  const selected = sources.find(s => s.id === sourceId);

  async function refresh() {
    if (!api) return;
    try {
      const next = await api.sources(); setSources(next);
      setSourceId(previous => next.some(s => s.id === previous) ? previous : next.find(s => s.type === sourceType)?.id || '');
    } catch (e) { setError(String((e as Error).message)); }
  }
  useEffect(() => {
    if (!api) return;
    api.check().then(setChecks).catch(e => setError(e.message));
    void refresh();
    return api.subscribe(event => {
      if (event.type === 'command') controls.current[event.command as keyof typeof controls.current]?.();
      if (event.type === 'setup') setMessage(event.message || '');
      if (event.type === 'progress') { setStage(event.stage || 'frames'); setMessage(event.message || ''); if (event.session) setSession(event.session); }
      if (event.type === 'ready' && event.session) { setSession(event.session); setMarkdown(event.session.markdown || ''); setInstalled(event.session.installed || ''); setError(event.session.installError || ''); setStage('ready'); setMessage(event.session.installed ? 'Your skill is installed.' : 'Your draft is ready to review.'); }
      if (event.type === 'error') { setStage('error'); setMessage(''); setError(event.message || 'Processing failed.'); if (event.session) setSession(event.session); }
    });
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const seconds = accrued.current + (paused ? 0 : (performance.now() - tickStart.current) / 1000);
      setElapsed(seconds); api?.status({ elapsed: seconds, paused, microphone }).catch(e => setError(e.message));
    }, 300);
    return () => clearInterval(timer);
  }, [active, paused, microphone]);

  async function prerequisite(action: 'setup' | 'login', newAccount = false) {
    if (!api) return;
    setBusy(true); setError(''); setMessage(action === 'login' ? 'Finish signing in in your browser…' : 'Preparing local processing…');
    try { setChecks(await (action === 'login' ? api.login(newAccount ? undefined : checks?.accountId || undefined) : api.setup())); setMessage(''); }
    catch (e) { setError((e as Error).message); }
    finally { api.check().then(setChecks).catch(e => setError(e.message)); setBusy(false); }
  }
  async function update(action: () => Promise<Checks>) {
    setBusy(true); setError(''); setMessage('');
    try { const result = await action(); setChecks(result); if (result.sessionSkillRoots) setSession(previous => previous ? { ...previous, skillRoots: result.sessionSkillRoots } : previous); setMessage(result.warning || ''); return true; }
    catch (e) { setMessage(''); setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); api?.check().then(setChecks).catch(() => {}); }
    finally { setBusy(false); }
    return false;
  }

  useEffect(() => {
    if (api && page === 'settings' && checks?.providerId === 'chatgpt' && checks.signedIn) void update(() => api.refreshModels());
  }, [page, checks?.providerId, checks?.signedIn]);

  async function stop() {
    const mediaRecorder = recorder.current;
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    setStage('saving'); setMessage('Saving your recording…');
    mediaRecorder.stop();
  }
  function pause() {
    const r = recorder.current;
    if (!r || r.state === 'inactive') return;
    if (r.state === 'recording') { r.pause(); accrued.current += (performance.now() - tickStart.current) / 1000; setPaused(true); }
    else { tickStart.current = performance.now(); r.resume(); setPaused(false); }
  }
  function toggleMic() {
    if (active && !audio.current) { setError('Microphone was off when recording started. Start a new recording to add narration.'); return; }
    const next = !microphone; setMicrophone(next); if (audio.current) audio.current.enabled = next;
  }
  controls.current = { start: () => { void start(); }, stop, pause, microphone: toggleMic };

  async function start() {
    if (!api || !selected) return;
    if (stage !== 'idle' || busy) { if (stage === 'ready' || stage === 'error') { setPage('record'); setError('Choose New recording before starting another workflow.'); } return; }
    if (!checks?.processor || !checks.signedIn || !checks.models.length) { setPage('record'); setError('Complete local setup and configure a provider and model in Settings before recording.'); return; }
    setPage('record');
    setBusy(true); setError(''); setInstalled(''); setMessage('');
    let started = false;
    try {
      setSession(await api.begin({ sourceId, microphone })); started = true;
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      tracks.current = display.getTracks();
      if (microphone) {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        audio.current = mic.getAudioTracks()[0]; tracks.current.push(...mic.getTracks());
      } else audio.current = null;
      const stream = new MediaStream([...display.getVideoTracks(), ...(audio.current ? [audio.current] : [])]);
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4500000 }); recorder.current = r;
      writeError.current = null; writes.current = Promise.resolve();
      r.ondataavailable = event => {
        if (!event.data.size) return;
        writes.current = writes.current.then(async () => { await api.append(new Uint8Array(await event.data.arrayBuffer())); }).catch(e => { writeError.current = e; void stop(); });
      };
      r.onstop = async () => {
        tracks.current.forEach(t => t.stop()); audio.current = null;
        await writes.current;
        try { await api.finish(!writeError.current); if (writeError.current) throw writeError.current; }
        catch (e) { setError((e as Error).message); setStage('error'); }
        recorder.current = null;
      };
      r.onerror = () => { writeError.current = new Error('Recording was interrupted. Your saved video is available in the session folder.'); void stop(); };
      display.getVideoTracks()[0].onended = () => void stop();
      accrued.current = 0; tickStart.current = performance.now(); setElapsed(0); setPaused(false); setStage('recording');
      r.start(1000);
      setTimeout(() => { if (live.current) { live.current.srcObject = display; void live.current.play(); } }, 0);
    } catch (e) {
      tracks.current.forEach(t => t.stop()); audio.current = null;
      if (started) await api.finish(false).catch(() => {});
      setStage('idle'); setError(`Could not start recording: ${(e as Error).message}. Check screen and microphone access, or turn the microphone off.`);
    } finally { setBusy(false); }
  }
  async function uploadVideo() {
    if (!api || busy || stage !== 'idle' || !checks?.processor || !generationReady) return;
    setBusy(true); setError(''); setMessage('Choose a video to turn into a skill…');
    let imported = false;
    try {
      const video = await api.importVideo();
      if (!video) { setMessage(''); return; }
      imported = true; setSession(video); setInstalled(''); setMarkdown(''); setStage('frames'); setMessage('Preparing your video…');
      await api.retry();
    } catch (e) {
      setMessage(''); setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''));
      if (imported) setStage('error');
    } finally { setBusy(false); }
  }
  async function install() {
    if (!api) return;
    setBusy(true); setError('');
    try { setInstalled(await api.save(markdown)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function newSession() {
    if (markdown && !installed && !window.confirm('Discard this edited draft and start a new recording? Your recording remains in the session folder.')) return;
    setStage('idle'); setSession(undefined); setMarkdown(''); setInstalled(''); setError(''); setMessage(''); void refresh();
  }

  const feedback = <>
    {!!message && (accountEditable || page === 'settings') && !busy && <div className="notice" role="status">{message}</div>}
    {!!error && checks?.providerId === 'chatgpt' && /usage|plan/i.test(error) && <button className="secondary usage-action" onClick={() => api?.manageUsage()}>Manage usage</button>}
    {error && <div className="notice error" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
  </>;
  return <div className="app-shell">
    <header className="app-header"><div className="brand"><Video size={22} /><span>Record a Skill</span></div><span className="header-note">Teach it once. Make it reusable.</span><div className="header-actions"><button className="quiet" onClick={() => api?.openFolder()} disabled={!api}><FolderOpen size={16} /><span>Local files</span></button><button className="quiet" aria-label="Settings" aria-pressed={page === 'settings'} onClick={() => setPage(page === 'settings' ? 'record' : 'settings')} disabled={active || processing}><SettingsIcon size={17} /><span>Settings</span></button></div></header>
    <main>
      {page === 'settings' ? <Settings checks={checks} busy={busy || active || processing} message={message} feedback={feedback} onBack={() => setPage('record')} onLogin={newAccount => { void prerequisite('login', newAccount); }} onUpdate={update} /> : <>
      <div className="page-heading"><div><h1>{active ? 'Show how it’s done.' : stage === 'ready' ? installed ? 'Your skill is installed.' : 'Make it a skill.' : processing ? 'Turning your session into a skill.' : 'A workflow worth keeping.'}</h1><p>{active ? 'Walk through the task. Narrate the choices that matter.' : stage === 'ready' ? installed ? 'Your workflow is saved in your skill folders. The recording and draft are here for reference.' : 'Check the demonstration, refine the instructions, then install.' : processing ? 'Your recording is saved. Keep this window open while the draft is prepared.' : checks?.settings.autoInstall ? 'Record your screen. Generate and install your skill automatically.' : 'Record your screen. Review the draft. Keep your process as a reusable skill.'}</p></div><span className={`session-state ${active ? 'is-recording' : ''}`}><span className="state-dot" />{active ? paused ? 'Paused' : 'Recording' : processing ? 'Processing' : stage === 'ready' ? installed ? 'Installed' : 'Draft ready' : 'New session'}</span></div>
      <ol className="steps" aria-label="Session progress">{stepLabels.map((label, i) => <li key={label} className={i === currentStep ? 'current' : i < currentStep ? 'complete' : ''} aria-current={i === currentStep ? 'step' : undefined}><span className="step-marker" aria-hidden="true">{i < currentStep ? <Check size={15} /> : i + 1}</span><span className="step-copy" key={i === currentStep ? stage : i}><strong>{label}</strong><small>{stepDetails[i]}</small></span></li>)}</ol>
      {!api && <div className="notice">Screen recording runs in the desktop app. Launch it with <code>npm run dev</code>.</div>}
      {feedback}
      <div className="workspace">
        <section className="evidence-panel" aria-label="Recording and evidence">
          <div className="panel-heading"><h2>{session ? 'Session recording' : 'Capture source'}</h2>{stage === 'idle' ? <button className="text-button" disabled={!api || busy || !checks?.processor || !generationReady} onClick={uploadVideo}><Upload size={16} /> Upload video</button> : <span className="muted">{session?.sourceName}</span>}</div>
          {stage === 'idle' ? <>
            <div className="source-controls"><div className="segmented"><button aria-pressed={sourceType === 'screen'} onClick={() => { setSourceType('screen'); setSourceId(sources.find(s => s.type === 'screen')?.id || ''); }}><Monitor size={16} /> Entire screen</button><button aria-pressed={sourceType === 'window'} onClick={() => { setSourceType('window'); setSourceId(sources.find(s => s.type === 'window')?.id || ''); }}><Square size={16} /> Window</button></div><button className="icon-button" aria-label="Refresh capture sources" onClick={refresh}><RefreshCw size={16} /></button></div>
            <div className="source-list">{sources.filter(s => s.type === sourceType).map(source => <button className={`source ${source.id === sourceId ? 'selected' : ''}`} key={source.id} aria-pressed={source.id === sourceId} onClick={() => setSourceId(source.id)}><div className="thumbnail"><img src={source.thumbnail} alt="" />{source.id === sourceId && <span className="selected-mark"><Check size={15} /></span>}</div><span><Monitor size={15} />{source.name}</span></button>)}</div>
            {!sources.some(s => s.type === sourceType) && <div className="empty-source"><Monitor size={38} /><h3>{api ? 'No capture sources found' : 'Your screen goes here'}</h3><p>{api ? 'Open a window, then refresh the sources.' : 'Choose an entire display or a single window in the desktop app.'}</p></div>}
            <div className="capture-note"><Monitor size={17} /><p>{sourceType === 'screen' ? 'Capture the whole display, even when you switch apps.' : 'Capture only the selected application window.'}<span>Only one display or window is recorded per session.</span></p></div>
          </> : <>
            <div className="video-stage">{active ? <video ref={live} autoPlay muted aria-label="Live recording preview" /> : session && <video ref={preview} src={session.videoUrl} controls preload="metadata" aria-label="Session recording" />}{active && <span className="video-status"><span className="record-light" />{paused ? 'Paused' : 'Recording'} <span className="timer">{clock(elapsed)}</span></span>}</div>
            {active && <div className="recording-controls"><button className="secondary" onClick={pause}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? 'Resume' : 'Pause'}</button><button className="secondary" onClick={toggleMic}>{microphone ? <Mic size={16} /> : <MicOff size={16} />}{microphone ? 'Mic on' : 'Mic off'}</button><button className="stop-button" onClick={stop}><Square size={14} fill="currentColor" /> Stop & create skill</button></div>}
            {processing && <div className="processing" role="status"><span className="processing-dot" /><div><strong>{message}</strong><p>{stage === 'generating' ? `Selected frames and narration are sent to ${providerName}.` : session?.microphone ? 'The narration model downloads on first use. This may take a few minutes.' : 'Video processing stays on this computer.'}</p></div><button className="quiet danger" onClick={() => api?.cancel()} disabled={stage === 'saving'}>Cancel</button></div>}
            {!!session?.frames.length && <div className="frames"><div className="frames-heading"><h3>Evidence frames</h3><span>{session.frames.length} moments selected</span></div><div className="frame-strip">{session.frames.map(frame => <button key={frame.file} aria-label={`Jump to ${frame.timestamp}`} aria-pressed={activeFrame === frame.file} onClick={() => { setActiveFrame(frame.file); if (preview.current) { preview.current.currentTime = frame.seconds; preview.current.focus(); } }}><img src={frame.url} alt={`Recording at ${frame.timestamp}`} /><span>{frame.timestamp}</span></button>)}</div></div>}
            {stage === 'error' && <div className="recovery"><p>Your recording is kept locally.</p><button className="secondary" onClick={() => { setError(''); api?.retry().catch(e => setError(e.message)); }}><RefreshCw size={16} /> Retry processing</button><button className="quiet" onClick={newSession}>New recording</button></div>}
          </>}
        </section>
        <aside className="task-panel">
          {stage === 'ready' ? <>
            <div className="panel-heading"><h2>{autoInstalled ? 'Installed skill' : 'Skill draft'}</h2><FileText size={17} /></div><div className="editor-tabs"><button aria-pressed={tab === 'skill'} onClick={() => setTab('skill')}>SKILL.md</button><button aria-pressed={tab === 'narration'} onClick={() => setTab('narration')}>Narration</button></div>
            {tab === 'skill' ? <textarea className="skill-editor" aria-label={autoInstalled ? 'View installed skill markdown' : 'Edit skill markdown'} readOnly={autoInstalled} spellCheck={false} value={markdown} onChange={e => { setMarkdown(e.target.value); setInstalled(''); }} /> : <div className="transcript">{session?.transcript || 'No narration was available for this session.'}</div>}
            {!!session?.uncertainties?.length && <details className="uncertainties" open><summary>{session.uncertainties.length} points to check</summary><ul>{session.uncertainties.map((item, i) => <li key={i}>{item}</li>)}</ul></details>}
            <div className="install-area">{installed ? <p className="success" role="status"><Check size={17} /><span>Skill installed.<small>{installed}</small></span></p> : <><button className="primary" disabled={busy || !markdown.trim()} onClick={install}><Download size={17} />{busy ? 'Installing…' : 'Install skill'}</button><p className="destination">Saves SKILL.md to {session?.skillRoots?.join(' + ') || checks?.skillRoot || 'your shared skill folder'}. Existing skills won’t be overwritten.</p></>}<button className="quiet" onClick={newSession}>Record another workflow <ArrowRight size={15} /></button></div>
          </> : <>
            <div className="panel-heading"><h2>Recording setup</h2><WandSparkles size={17} /></div>
            <div className="setup-body">
              <div className="microphone-row"><div>{microphone ? <Mic size={19} /> : <MicOff size={19} />}<span>Microphone<small>{microphone ? 'Narrate decisions as you go' : 'Screen only, no narration'}</small></span></div><button className="switch" role="switch" aria-label="Record microphone" aria-checked={microphone} onClick={toggleMic} disabled={stage !== 'idle' || busy}><span /></button></div>
              {stage === 'idle' && <div className="readiness"><h3>Ready to record</h3><div><span className="readiness-item">{checks?.processor ? <Check size={16} /> : <Circle className="not-ready" size={14} />} Local video processor</span>{!checks?.processor && <button className="text-button" disabled={busy || !api || !checks} onClick={() => prerequisite('setup')}>{busy ? 'Working…' : 'Set up'}</button>}</div><div><span className="readiness-item">{generationReady ? <Check size={16} /> : <Circle className="not-ready" size={14} />} Generation provider</span>{!generationReady && <button className="text-button" disabled={busy || !api || !checks} onClick={() => setPage('settings')}>Configure</button>}</div>{busy && <><p role="status">{message || 'Updating configuration…'}</p><button className="text-button danger" onClick={() => api?.cancel()}>Cancel</button></>}</div>}
              {generationReady && <div className="generation-summary"><div><h3>{providerName}</h3><button className="text-button" disabled={!accountEditable || busy} onClick={() => setPage('settings')}>Configure</button></div><p>{generationModel?.name}</p><small>{checks?.settings.autoInstall ? 'Auto install is on' : 'Review before installing'}</small></div>}
              <div className="flow-note"><h3>When you press Stop</h3><p>The app prepares frames and narration locally. {providerName} analyzes your demonstration, identifies the task, and drafts a reusable skill.{checks?.settings.autoInstall ? ' Validated drafts install into your skill folders automatically.' : ' Review the draft before installing.'}</p></div>
            </div>
            {stage === 'idle' && <div className="start-area"><button className="primary" disabled={!api || !selected || busy || !checks?.processor || !generationReady} onClick={start}><span className="button-record-dot" /> Start recording</button><p>{shortcutLabel(checks?.settings.shortcut || 'Control+Shift+R')} · Selected evidence will be sent to {providerName}.</p></div>}
          </>}
        </aside>
      </div>
      <footer><span><span className="state-dot" /> Recordings stay on this device</span><span>{checks?.settings.autoInstall ? 'Auto install enabled · existing skills are preserved' : 'Review the draft before installing'}</span></footer>
      </>}
    </main>
  </div>;
}
