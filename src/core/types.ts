export type Importance = 'normal' | 'major' | 'permanent';
export type ItemStatus = 'held' | 'gifted' | 'lost' | 'consumed';
export type ImportantEventCategory = '约定' | '誓言' | '束缚' | '重大事件';
export type TimelineNodeType = '主线' | '支线' | '伏笔' | '里程碑';
export type TimelineStatus = '未发生' | '进行中' | '已发生';
export type DirectorView = 'current' | 'current-next' | 'volume' | 'full';

export interface ImportantEvent {
  id: string;
  title: string;
  category: ImportantEventCategory | string;
  content: string;
  characters: string[];
  at: number;
  entryId: string | null;
  messageId: number | null;
}

export interface TurnSnapshot {
  bonds: Record<string, Bond>;
  items: Item[];
  importantEvents: ImportantEvent[];
}

export interface MemoryEntry {
  id: string;
  messageId: number;
  swipeId: number;
  mesHash: string;
  at: number;
  storyTime: string;
  location: string;
  summary: string;
  characters: string[];
  result: string;
  importance: Importance;
  anchor?: string;
  volume: number;
  source: 'model' | 'manual' | 'raw';
  stale?: boolean;
  prevSnapshot?: TurnSnapshot;
}

export interface Volume {
  index: number;
  title: string;
  timeRange: string;
  recap: string;
  entries: MemoryEntry[];
  sealedAt: number;
  auto: boolean;
}

export interface EpochVolume {
  index: number;
  title: string;
  timeRange: string;
  recap: string;
  volumes: Volume[];
  sealedAt: number;
  auto: boolean;
}

export interface BondEvent {
  id: string;
  text: string;
  delta: number;
  importance: Importance;
  at: number;
  entryId: string | null;
  messageId: number | null;
  major?: boolean;
}

export interface Bond {
  name: string;
  avatar?: string;
  initialScore: number;
  manualDelta: number;
  relation?: string;
  impression: string;
  impressionOverride?: string;
  events: BondEvent[];
  updatedAt: number;
  entryId?: string | null;
  messageId?: number | null;
}

export interface Item {
  id: string;
  name: string;
  holder?: string;
  condition?: string;
  source: string;
  effect: string;
  status: ItemStatus;
  acquiredAt: number;
  entryId: string | null;
  messageId: number | null;
  note?: string;
}

export interface TimelineNode {
  id: string;
  order: number;
  title: string;
  summary: string;
  type: TimelineNodeType;
  keywords: string[];
  status: TimelineStatus;
  spoiler: boolean;
}

export interface Timeline {
  generatedAt: number;
  sources: { char: string; worldBooks: string[] };
  nodes: TimelineNode[];
  currentId: string | null;
}

export interface MnemeState {
  version: 1;
  entries: MemoryEntry[];
  volumes: Volume[];
  epochs?: EpochVolume[];
  bonds: Record<string, Bond>;
  items: Item[];
  importantEvents: ImportantEvent[];
  timeline: Timeline | null;
  config: { worldBooks: string[] };
  stats: { totalEntries: number; sealedVolumes: number; sealedEpochs?: number };
}

export interface MnemeUi {
  theme: 'auto' | 'light' | 'dark';
  accent: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  fontSize: number;
  positioned?: boolean;
  ballVisible: boolean;
  ballX?: number;
  ballY?: number;
  ballPositioned?: boolean;
  ballText: string;
  ballImage: string;
  ballSize: number;
  ballOpacity: number;
  ballBgTransparent: boolean;
  ballBg: string;
  ballBorder: boolean;
  ballBorderColor: string;
  ballColor: string;
  ballHalfHide: boolean;
}

export interface MnemeSettings {
  settingsVersion?: number;
  enabled: boolean;
  enableMemory?: boolean;
  enableBonds?: boolean;
  enableItems?: boolean;
  enableEvents?: boolean;
  volumeSize: number;
  epochSize?: number;
  majorRetentionVolumes: number;
  tokenBudget: number;
  trimContextEnabled?: boolean;
  autoStripBlock?: boolean;
  keepRecentTurns: number;
  directorView: DirectorView;
  autoInitBonds: boolean;
  autoTimeline: boolean;
  showMissingBadge: boolean;
  debug: boolean;
  summaryPrompt: string;
  sealPrompt?: string;
  epochPrompt?: string;
  ui: MnemeUi;
}

export interface DeltaBond {
  name: string;
  delta?: number;
  score?: number;
  relation?: string;
  impression?: string;
  event?: string;
  majorEvent?: string;
  importance?: Importance;
}

export interface DeltaItem {
  action: 'gain' | 'lose' | 'consume' | 'change' | 'give' | 'update';
  name: string;
  holder?: string;
  condition?: string;
  source?: string;
  effect?: string;
  description?: string;
  note?: string;
}

export interface DeltaImportantEvent {
  title: string;
  category?: ImportantEventCategory | string;
  content: string;
  characters?: string[];
}

export interface DeltaSeal {
  title?: string;
  timeRange?: string;
  time_range?: string;
  time?: string;
  recap?: string;
}

export interface DeltaPlot {
  advance?: string[];
  current?: string;
}

export interface Delta {
  summary: string;
  storyTime?: string;
  location?: string;
  characters?: string[];
  result?: string;
  importance?: Importance;
  anchor?: string;
  bonds?: DeltaBond[];
  items?: DeltaItem[];
  events?: DeltaImportantEvent[];
  plot?: DeltaPlot;
  seal?: DeltaSeal;
  epoch?: DeltaSeal;
}
