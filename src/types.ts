export type Source = { id: string; name: string; thumbnail: string; type: 'screen' | 'window' };
export type Frame = { file: string; timestamp: string; seconds: number; reason: string; url: string };
export type Session = { id: string; sourceName: string; microphone: boolean; videoUrl: string; frames: Frame[]; transcript?: string; markdown?: string; uncertainties?: string[]; installed?: string; installError?: string; skillRoots?: string[] };
export type Status = { elapsed: number; paused: boolean; microphone: boolean };
export type SkillTarget = 'claude' | 'grok' | 'antigravity';
export type Preferences = { autoInstall: boolean; additionalSkillTargets: SkillTarget[]; shortcut: string };
export type ProviderInput = { id?: string; kind: string; label: string; endpoint: string; apiKey: string; model: string };
export type Connection = Omit<ProviderInput, 'apiKey'> & { id: string; hasKey: boolean };
export type Checks = { processor: boolean; signedIn: boolean; skillRoot: string; skillRoots?: string[]; sessionSkillRoots?: string[]; accountLabel?: string; accountId: string; accounts: { id: string; label: string; connected: boolean }[]; models: { id: string; name: string }[]; model: string; welcome: boolean; warning?: string; toolInstalled?: boolean; providerId: string; providerName: string; modelSource: 'provider' | 'manual' | 'tool'; localTools?: { id: string; kind: string; name: string; docs: string; singleAccount?: boolean }[]; providerKinds: { id: string; name: string; endpoint: string }[]; connections: Connection[]; settings: Preferences; shortcutRegistered: boolean; shortcutWarning?: string };
export type Event = { type: string; message?: string; stage?: 'frames' | 'generating'; session?: Session; command?: string } & Partial<Status>;
export interface Recorder {
  check(): Promise<Checks>; setup(): Promise<Checks>; login(accountId?: string): Promise<Checks>;
  account(id: string): Promise<Checks>; model(id: string, manual?: boolean): Promise<Checks>; logout(): Promise<Checks>;
  settings(value: Preferences): Promise<Checks>; provider(id: string): Promise<Checks>;
  shortcutCapture(active: boolean): Promise<void>;
  toolLogin(id: string, newAccount?: boolean): Promise<Checks>; toolAccount(id: string, accountId: string): Promise<Checks>; toolLogout(id: string): Promise<Checks>; toolInstall(id: string): Promise<Checks>; toolDocs(id: string): Promise<void>;
  saveProvider(value: ProviderInput): Promise<Checks>; removeProvider(id: string): Promise<Checks>; refreshModels(): Promise<Checks>;
  acknowledge(): Promise<Checks>; manageUsage(id?: string): Promise<void>;
  sources(): Promise<Source[]>; begin(input: { sourceId: string; microphone: boolean }): Promise<Session>;
  importVideo(): Promise<Session | null>;
  append(chunk: Uint8Array): Promise<void>; finish(process?: boolean): Promise<void>;
  status(status: Status): Promise<void>; command(command: string): Promise<void>;
  retry(): Promise<void>; cancel(): Promise<void>; save(markdown: string): Promise<string>;
  openFolder(): Promise<void>; subscribe(callback: (event: Event) => void): () => void;
}
declare global { interface Window { recorder?: Recorder } }
