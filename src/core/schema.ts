import type {
  Bond,
  BondEvent,
  EpochVolume,
  Importance,
  ImportantEvent,
  Item,
  ItemStatus,
  MemoryEntry,
  MnemeState,
  Timeline,
  TimelineNode,
  TimelineNodeType,
  TimelineStatus,
  TurnSnapshot,
  Volume,
} from './types.ts';

function isObj(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function asStr(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : fallback;
}

function asNum(val: unknown, fallback = 0): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

function asInt(val: unknown, fallback = 0): number {
  return typeof val === 'number' && Number.isInteger(val) ? val : fallback;
}

function asBool(val: unknown, fallback = false): boolean {
  return typeof val === 'boolean' ? val : fallback;
}

function asImportance(val: unknown): Importance {
  return val === 'major' || val === 'permanent' || val === 'normal' ? val : 'normal';
}

function asItemStatus(val: unknown): ItemStatus {
  return val === 'held' || val === 'gifted' || val === 'lost' || val === 'consumed'
    ? val
    : 'held';
}

function asNodeType(val: unknown): TimelineNodeType {
  return val === '主线' || val === '支线' || val === '伏笔' || val === '里程碑' ? val : '主线';
}

function asNodeStatus(val: unknown): TimelineStatus {
  return val === '未发生' || val === '进行中' || val === '已发生' ? val : '未发生';
}

function normalizeBondEvent(raw: unknown): BondEvent | null {
  if (!isObj(raw) || typeof raw.id !== 'string') return null;
  const ev: BondEvent = {
    id: raw.id,
    text: asStr(raw.text, ''),
    delta: asNum(raw.delta, 0),
    importance: asImportance(raw.importance),
    at: asNum(raw.at, 0),
    entryId: typeof raw.entryId === 'string' ? raw.entryId : null,
    messageId: typeof raw.messageId === 'number' ? raw.messageId : null,
  };
  if (typeof raw.major === 'boolean') ev.major = raw.major;
  return ev;
}

function normalizeBond(raw: unknown): Bond | null {
  if (!isObj(raw) || typeof raw.name !== 'string') return null;
  const eventsRaw = Array.isArray(raw.events) ? raw.events : [];
  const events: BondEvent[] = [];
  for (const item of eventsRaw) {
    const parsed = normalizeBondEvent(item);
    if (!parsed) return null;
    events.push(parsed);
  }
  const bond: Bond = {
    name: raw.name,
    initialScore: asNum(raw.initialScore, 0),
    manualDelta: asNum(raw.manualDelta, 0),
    relation: asStr(raw.relation, ''),
    impression: asStr(raw.impression, ''),
    events,
    updatedAt: asNum(raw.updatedAt, 0),
  };
  if (typeof raw.avatar === 'string') bond.avatar = raw.avatar;
  if (typeof raw.impressionOverride === 'string') bond.impressionOverride = raw.impressionOverride;
  if (raw.entryId === null || typeof raw.entryId === 'string') bond.entryId = raw.entryId;
  if (raw.messageId === null || typeof raw.messageId === 'number') bond.messageId = raw.messageId;
  return bond;
}

function normalizeItem(raw: unknown): Item | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const item: Item = {
    id: raw.id,
    name: raw.name,
    holder: asStr(raw.holder, ''),
    condition: asStr(raw.condition, ''),
    source: asStr(raw.source, ''),
    effect: asStr(raw.effect, ''),
    status: asItemStatus(raw.status),
    acquiredAt: asNum(raw.acquiredAt, 0),
    entryId: typeof raw.entryId === 'string' ? raw.entryId : null,
    messageId: typeof raw.messageId === 'number' ? raw.messageId : null,
  };
  if (typeof raw.note === 'string') item.note = raw.note;
  return item;
}

function normalizeImportantEvent(raw: unknown): ImportantEvent | null {
  if (!isObj(raw) || typeof raw.id !== 'string') return null;
  const chars = Array.isArray(raw.characters)
    ? raw.characters.filter((c): c is string => typeof c === 'string')
    : [];
  return {
    id: raw.id,
    title: asStr(raw.title, ''),
    category: asStr(raw.category, '重大事件'),
    content: asStr(raw.content, ''),
    characters: chars,
    at: asNum(raw.at, 0),
    entryId: typeof raw.entryId === 'string' ? raw.entryId : null,
    messageId: typeof raw.messageId === 'number' ? raw.messageId : null,
  };
}

function normalizeTurnSnapshot(raw: unknown): TurnSnapshot | undefined {
  if (!isObj(raw)) return undefined;
  const bonds: Record<string, Bond> = {};
  if (isObj(raw.bonds)) {
    for (const [k, v] of Object.entries(raw.bonds)) {
      const b = normalizeBond(v);
      if (b) bonds[k] = b;
    }
  }
  const items: Item[] = [];
  if (Array.isArray(raw.items)) {
    for (const it of raw.items) {
      const parsed = normalizeItem(it);
      if (parsed) items.push(parsed);
    }
  }
  const importantEvents: ImportantEvent[] = [];
  if (Array.isArray(raw.importantEvents)) {
    for (const ev of raw.importantEvents) {
      const parsed = normalizeImportantEvent(ev);
      if (parsed) importantEvents.push(parsed);
    }
  }
  return { bonds, items, importantEvents };
}

function normalizeMemoryEntry(raw: unknown): MemoryEntry | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !Number.isInteger(raw.messageId)) return null;
  const chars = Array.isArray(raw.characters)
    ? raw.characters.filter((c): c is string => typeof c === 'string')
    : [];
  const source =
    raw.source === 'manual' || raw.source === 'raw' || raw.source === 'model'
      ? raw.source
      : 'model';
  const entry: MemoryEntry = {
    id: raw.id,
    messageId: raw.messageId as number,
    swipeId: asInt(raw.swipeId, 0),
    mesHash: asStr(raw.mesHash, ''),
    at: asNum(raw.at, 0),
    storyTime: asStr(raw.storyTime, ''),
    location: asStr(raw.location, ''),
    summary: asStr(raw.summary, ''),
    characters: chars,
    result: asStr(raw.result, ''),
    importance: asImportance(raw.importance),
    volume: asInt(raw.volume, 0),
    source,
  };
  if (typeof raw.anchor === 'string') entry.anchor = raw.anchor;
  if (typeof raw.stale === 'boolean') entry.stale = raw.stale;
  const snap = normalizeTurnSnapshot(raw.prevSnapshot);
  if (snap) entry.prevSnapshot = snap;
  return entry;
}

function normalizeVolume(raw: unknown): Volume | null {
  if (!isObj(raw) || !Number.isInteger(raw.index)) return null;
  const entriesRaw = raw.entries === undefined ? [] : raw.entries;
  if (!Array.isArray(entriesRaw)) return null;
  const entries: MemoryEntry[] = [];
  for (const item of entriesRaw) {
    const parsed = normalizeMemoryEntry(item);
    if (!parsed) return null;
    entries.push(parsed);
  }
  return {
    index: raw.index as number,
    title: asStr(raw.title, ''),
    timeRange: asStr(raw.timeRange, ''),
    recap: asStr(raw.recap, ''),
    entries,
    sealedAt: asNum(raw.sealedAt, 0),
    auto: asBool(raw.auto, false),
  };
}

function normalizeEpochVolume(raw: unknown): EpochVolume | null {
  if (!isObj(raw) || !Number.isInteger(raw.index)) return null;
  const volumesRaw = raw.volumes === undefined ? [] : raw.volumes;
  if (!Array.isArray(volumesRaw)) return null;
  const volumes: Volume[] = [];
  for (const item of volumesRaw) {
    const parsed = normalizeVolume(item);
    if (!parsed) return null;
    volumes.push(parsed);
  }
  return {
    index: raw.index as number,
    title: asStr(raw.title, ''),
    timeRange: asStr(raw.timeRange, ''),
    recap: asStr(raw.recap, ''),
    volumes,
    sealedAt: asNum(raw.sealedAt, 0),
    auto: asBool(raw.auto, false),
  };
}

function normalizeTimelineNode(raw: unknown): TimelineNode | null {
  if (!isObj(raw) || typeof raw.id !== 'string') return null;
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.filter((k): k is string => typeof k === 'string')
    : [];
  return {
    id: raw.id,
    order: asInt(raw.order, 0),
    title: asStr(raw.title, ''),
    summary: asStr(raw.summary, ''),
    type: asNodeType(raw.type),
    keywords,
    status: asNodeStatus(raw.status),
    spoiler: asBool(raw.spoiler, true),
  };
}

function normalizeTimeline(raw: unknown): Timeline | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (!isObj(raw)) return undefined;
  const nodesRaw = raw.nodes === undefined ? [] : raw.nodes;
  if (!Array.isArray(nodesRaw)) return undefined;
  const nodes: TimelineNode[] = [];
  for (const item of nodesRaw) {
    const parsed = normalizeTimelineNode(item);
    if (!parsed) return undefined;
    nodes.push(parsed);
  }
  const srcObj = isObj(raw.sources) ? raw.sources : {};
  const worldBooks = Array.isArray(srcObj.worldBooks)
    ? srcObj.worldBooks.filter((w): w is string => typeof w === 'string')
    : [];
  return {
    generatedAt: asNum(raw.generatedAt, 0),
    sources: {
      char: asStr(srcObj.char, ''),
      worldBooks,
    },
    nodes,
    currentId: typeof raw.currentId === 'string' ? raw.currentId : null,
  };
}

export function createEmptyState(): MnemeState {
  return {
    version: 1,
    entries: [],
    volumes: [],
    epochs: [],
    bonds: {},
    items: [],
    importantEvents: [],
    timeline: null,
    config: { worldBooks: [] },
    stats: { totalEntries: 0, sealedVolumes: 0, sealedEpochs: 0 },
  };
}

export function normalizeState(raw: unknown): MnemeState | null {
  if (!isObj(raw) || raw.version !== 1) return null;

  const entriesRaw = raw.entries === undefined ? [] : raw.entries;
  if (!Array.isArray(entriesRaw)) return null;
  const entries: MemoryEntry[] = [];
  for (const item of entriesRaw) {
    const parsed = normalizeMemoryEntry(item);
    if (!parsed) return null;
    entries.push(parsed);
  }

  const volumesRaw = raw.volumes === undefined ? [] : raw.volumes;
  if (!Array.isArray(volumesRaw)) return null;
  const volumes: Volume[] = [];
  for (const item of volumesRaw) {
    const parsed = normalizeVolume(item);
    if (!parsed) return null;
    volumes.push(parsed);
  }

  const epochsRaw = raw.epochs === undefined ? [] : raw.epochs;
  if (!Array.isArray(epochsRaw)) return null;
  const epochs: EpochVolume[] = [];
  for (const item of epochsRaw) {
    const parsed = normalizeEpochVolume(item);
    if (!parsed) return null;
    epochs.push(parsed);
  }

  const bondsRaw = raw.bonds === undefined ? {} : raw.bonds;
  if (!isObj(bondsRaw)) return null;
  const bonds: Record<string, Bond> = {};
  for (const [k, v] of Object.entries(bondsRaw)) {
    const parsed = normalizeBond(v);
    if (!parsed) return null;
    bonds[k] = parsed;
  }

  const itemsRaw = raw.items === undefined ? [] : raw.items;
  if (!Array.isArray(itemsRaw)) return null;
  const items: Item[] = [];
  for (const item of itemsRaw) {
    const parsed = normalizeItem(item);
    if (!parsed) return null;
    items.push(parsed);
  }

  const eventsRaw = raw.importantEvents === undefined ? [] : raw.importantEvents;
  if (!Array.isArray(eventsRaw)) return null;
  const importantEvents: ImportantEvent[] = [];
  for (const item of eventsRaw) {
    const parsed = normalizeImportantEvent(item);
    if (!parsed) return null;
    importantEvents.push(parsed);
  }

  const timeline = normalizeTimeline(raw.timeline);
  if (timeline === undefined) return null;

  const cfgObj = isObj(raw.config) ? raw.config : {};
  const worldBooks = Array.isArray(cfgObj.worldBooks)
    ? cfgObj.worldBooks.filter((w): w is string => typeof w === 'string')
    : [];

  const statsObj = isObj(raw.stats) ? raw.stats : {};

  return {
    version: 1,
    entries,
    volumes,
    epochs,
    bonds,
    items,
    importantEvents,
    timeline,
    config: { worldBooks },
    stats: {
      totalEntries: asInt(statsObj.totalEntries, 0),
      sealedVolumes: asInt(statsObj.sealedVolumes, 0),
      sealedEpochs: asInt(statsObj.sealedEpochs, 0),
    },
  };
}
