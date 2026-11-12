// 岁记 (Suiji) v2.0.0 - SillyTavern 三级卷宗式记忆扩展 (零外部依赖单文件 ES Module)

function getCtx() {
  const st = globalThis.SillyTavern;
  if (!st || typeof st.getContext !== 'function') return null;
  try {
    return st.getContext();
  } catch {
    return null;
  }
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashText(text) {
  let h = 2166136261;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function roundDecimal(value, digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
}

function bondScore(bond) {
  const eventSum = (bond.events ?? []).reduce((sum, ev) => sum + (Number(ev.delta) || 0), 0);
  return roundDecimal((Number(bond.initialScore) || 0) + eventSum + (Number(bond.manualDelta) || 0), 1);
}

function bondRelation(bond) {
  return String(bond.relation ?? '').trim();
}

function createEmptyState() {
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

function migrateState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { state: createEmptyState(), status: 'empty' };
  }
  if (raw.entries !== undefined && !Array.isArray(raw.entries)) {
    return { state: createEmptyState(), status: 'failed' };
  }
  const base = createEmptyState();
  const state = {
    version: 1,
    entries: Array.isArray(raw.entries) ? cloneData(raw.entries) : [],
    volumes: Array.isArray(raw.volumes) ? cloneData(raw.volumes) : [],
    epochs: Array.isArray(raw.epochs) ? cloneData(raw.epochs) : [],
    bonds: raw.bonds && typeof raw.bonds === 'object' && !Array.isArray(raw.bonds) ? cloneData(raw.bonds) : {},
    items: Array.isArray(raw.items) ? cloneData(raw.items) : [],
    importantEvents: Array.isArray(raw.importantEvents) ? cloneData(raw.importantEvents) : [],
    timeline: raw.timeline && typeof raw.timeline === 'object' ? cloneData(raw.timeline) : null,
    config: {
      worldBooks: Array.isArray(raw.config?.worldBooks) ? [...raw.config.worldBooks] : [],
    },
    stats: {
      totalEntries: Number(raw.stats?.totalEntries) || 0,
      sealedVolumes: Number(raw.stats?.sealedVolumes) || 0,
      sealedEpochs: Number(raw.stats?.sealedEpochs) || 0,
    },
  };
  for (const v of state.volumes) {
    if (typeof v.timeRange !== 'string') v.timeRange = '';
    if (!Array.isArray(v.entries)) v.entries = [];
  }
  for (const ep of state.epochs) {
    if (typeof ep.timeRange !== 'string') ep.timeRange = '';
    if (!Array.isArray(ep.volumes)) ep.volumes = [];
  }
  for (const b of Object.values(state.bonds)) {
    if (typeof b.relation !== 'string') b.relation = '';
    if (typeof b.impression !== 'string') b.impression = '';
    if (!Array.isArray(b.events)) b.events = [];
  }
  for (const it of state.items) {
    if (typeof it.holder !== 'string') it.holder = '';
    if (typeof it.condition !== 'string') it.condition = '';
    if (typeof it.source !== 'string') it.source = '';
    if (typeof it.effect !== 'string') it.effect = '';
    if (!['held', 'gifted', 'lost', 'consumed'].includes(it.status)) it.status = 'held';
  }
  return {
    state: Object.assign(base, state),
    status: raw.version === 1 ? 'ok' : 'repaired',
  };
}

const DEFAULT_SETTINGS = {
  enabled: true,
  enableMemory: true,
  enableBonds: true,
  enableItems: true,
  enableEvents: true,
  volumeSize: 10,
  epochSize: 10,
  majorRetentionVolumes: 2,
  tokenBudget: 2000,
  trimContextEnabled: false,
  autoStripBlock: true,
  keepRecentTurns: 10,
  directorView: 'current',
  autoInitBonds: false,
  autoTimeline: false,
  showMissingBadge: true,
  debug: false,
  summaryPrompt: '',
  sealPrompt: '',
  epochPrompt: '',
  ui: {
    theme: 'auto',
    accent: '#b08d57',
    x: 24,
    y: 80,
    width: 440,
    height: 580,
    minimized: false,
    fontSize: 14,
    ballVisible: true,
    ballPositioned: false,
    ballText: '岁',
    ballImage: '',
    ballSize: 44,
    ballOpacity: 1,
    ballBgTransparent: true,
    ballBg: '#1a1a1e',
    ballBorder: false,
    ballBorderColor: '#b08d57',
    ballColor: '#b08d57',
    ballHalfHide: true,
  },
};

const settingsStore = cloneData(DEFAULT_SETTINGS);
const store = { state: null, status: 'empty' };
const panelState = {
  visible: false,
  activeTab: 'memory',
  showHelp: false,
  showSettings: false,
  overviewOpen: false,
  ballDot: false,
  missing: 0,
  raw: 0,
  trimmedLast: 0,
  trimmedAt: 0,
  lastSealed: null,
};

let renderApp = () => {};

function mergeSettings(base, patch) {
  const merged = {
    ...base,
    ...(patch ?? {}),
    ui: { ...base.ui, ...(patch?.ui ?? {}) },
  };
  merged.enableMemory = merged.enableMemory !== false;
  merged.enableBonds = merged.enableBonds !== false;
  merged.enableItems = merged.enableItems !== false;
  merged.enableEvents = merged.enableEvents !== false;
  merged.volumeSize = Math.min(30, Math.max(5, Math.round(Number(merged.volumeSize) || 10)));
  merged.epochSize = Math.min(30, Math.max(2, Math.round(Number(merged.epochSize) || 10)));
  merged.majorRetentionVolumes = Math.max(0, Math.round(Number(merged.majorRetentionVolumes) || 0));
  merged.tokenBudget = Math.max(200, Math.round(Number(merged.tokenBudget) || 2000));
  merged.trimContextEnabled = false;
  merged.autoStripBlock = merged.autoStripBlock !== false;
  merged.sealPrompt = String(merged.sealPrompt ?? '');
  merged.epochPrompt = String(merged.epochPrompt ?? '');

  const ui = merged.ui;
  ui.ballText = String(ui.ballText ?? '岁').trim().slice(0, 4) || '岁';
  ui.ballImage = String(ui.ballImage ?? '').trim();
  ui.ballSize = Math.min(72, Math.max(32, Math.round(Number(ui.ballSize) || 44)));
  const opacity = Number(ui.ballOpacity);
  ui.ballOpacity = Math.min(1, Math.max(0.2, Number.isFinite(opacity) ? opacity : 1));
  ui.ballBgTransparent = ui.ballBgTransparent !== false;
  ui.ballBorder = ui.ballBorder === true;
  ui.ballHalfHide = ui.ballHalfHide !== false;
  ui.ballBg = String(ui.ballBg || '#1a1a1e');
  ui.ballBorderColor = String(ui.ballBorderColor || '#b08d57');
  ui.ballColor = String(ui.ballColor || '#b08d57');
  return merged;
}

function readSettings() {
  const ctx = getCtx();
  const ext = ctx?.extensionSettings;
  if (!ext) return mergeSettings(DEFAULT_SETTINGS, undefined);
  const source =
    ext.suiji && typeof ext.suiji === 'object'
      ? ext.suiji
      : ext.mneme && typeof ext.mneme === 'object'
        ? ext.mneme
        : {};
  ext.suiji = source;
  return mergeSettings(DEFAULT_SETTINGS, source);
}

function centeredUi(base) {
  if (typeof window === 'undefined') return { ...base, x: 24, y: 80, positioned: true };
  const margin = 24;
  const width = Math.min(base.width, Math.max(320, window.innerWidth - margin * 2));
  const height = Math.min(base.height, Math.max(320, window.innerHeight - margin * 2));
  return {
    ...base,
    width,
    height,
    x: Math.max(margin, Math.round((window.innerWidth - width) / 2)),
    y: Math.max(margin, Math.round((window.innerHeight - height) / 2)),
    positioned: true,
  };
}

function persistSettings(next) {
  const ctx = getCtx();
  if (!ctx?.extensionSettings) return;
  const copy = cloneData(next);
  ctx.extensionSettings.suiji = copy;
  ctx.extensionSettings.mneme = copy;
  try {
    ctx.saveSettingsDebounced?.();
  } catch (err) {
    console.warn('[岁记] settings save failed', err);
  }
}

function reloadSettings() {
  const merged = readSettings();
  let changed = false;
  if (!merged.settingsVersion || merged.settingsVersion < 3) {
    merged.autoInitBonds = false;
    merged.autoTimeline = false;
    merged.trimContextEnabled = false;
    if (merged.autoStripBlock === undefined) merged.autoStripBlock = true;
    merged.enableMemory = merged.enableMemory !== false;
    merged.enableBonds = merged.enableBonds !== false;
    merged.enableItems = merged.enableItems !== false;
    merged.enableEvents = merged.enableEvents !== false;
    merged.settingsVersion = 3;
    changed = true;
  }
  if (!merged.ui.positioned) {
    merged.ui = centeredUi(merged.ui);
    changed = true;
  }
  const { ui: mergedUi, ...rest } = merged;
  Object.assign(settingsStore, rest);
  Object.assign(settingsStore.ui, mergedUi);
  if (changed) persistSettings(merged);
}

function updateSettings(patch) {
  const next = mergeSettings(settingsStore, patch);
  Object.assign(settingsStore, next);
  Object.assign(settingsStore.ui, next.ui);
  persistSettings(next);
  renderApp();
}

let saveTimer = null;
let lastChatId = undefined;

function loadFromChat() {
  const ctx = getCtx();
  if (!ctx || !ctx.chatMetadata) {
    store.state = null;
    store.status = 'no-chat';
    lastChatId = ctx?.chatId ?? null;
    return null;
  }
  lastChatId = ctx.chatId ?? null;
  const raw = ctx.chatMetadata.suiji ?? ctx.chatMetadata.mneme;
  const result = migrateState(raw);
  if (result.status === 'failed' && raw) {
    try {
      ctx.chatMetadata.suiji_backup = raw;
    } catch {}
  }
  store.state = result.state;
  store.status = result.status;
  return result.state;
}

function ensureStateForChat() {
  const ctx = getCtx();
  const chatId = ctx?.chatId ?? null;
  if (lastChatId === undefined || chatId !== lastChatId) {
    return loadFromChat();
  }
  return store.state;
}

function commitState(next) {
  store.state = next;
  const ctx = getCtx();
  if (ctx && ctx.chatMetadata) {
    const serialized = cloneData(next);
    ctx.chatMetadata.suiji = serialized;
    ctx.chatMetadata.mneme = serialized;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        void ctx.saveMetadata?.();
      } catch {}
    }, 400);
  }
  renderApp();
}

async function flushState() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const ctx = getCtx();
  try {
    await ctx?.saveMetadata?.();
  } catch {}
}

// 解析与剥离
const BLOCK_RE = /<!--\s*(?:SUIJI|MNEME)([\s\S]*?)(?:SUIJI|MNEME)\s*-->/i;
const STRIP_BLOCK_RE = /<!--\s*(?:SUIJI|MNEME)[\s\S]*?(?:SUIJI|MNEME)\s*-->/gi;
const FENCE_RE = /```(?:suiji|mneme|json)\s*([\s\S]*?)```/i;
const STRIP_FENCE_RE = /```(?:suiji|mneme)\s*[\s\S]*?```/gi;

function stripDelta(text) {
  if (!text || typeof text !== 'string') return { text: '', removed: false };
  let output = text;
  let removed = false;
  if (STRIP_BLOCK_RE.test(output)) {
    STRIP_BLOCK_RE.lastIndex = 0;
    output = output.replace(STRIP_BLOCK_RE, '');
    removed = true;
  } else if (STRIP_FENCE_RE.test(output)) {
    STRIP_FENCE_RE.lastIndex = 0;
    output = output.replace(STRIP_FENCE_RE, '');
    removed = true;
  }
  if (!removed) return { text, removed: false };
  output = output.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: output, removed: true };
}

function asString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function parseDelta(text) {
  if (!text || typeof text !== 'string') return { ok: false, reason: 'empty' };
  let inner;
  let block;
  const blockMatch = text.match(BLOCK_RE);
  if (blockMatch) {
    block = blockMatch[0];
    inner = blockMatch[1];
  } else {
    const fenceMatch = text.match(FENCE_RE);
    if (
      fenceMatch &&
      /"(?:summary|memory|bonds|items|events|importantEvents|seal|epoch)"\s*:/.test(fenceMatch[1])
    ) {
      block = fenceMatch[0];
      inner = fenceMatch[1];
    }
  }
  if (!inner) return { ok: false, reason: 'no-block' };

  let cleaned = inner.replace(/^\uFEFF/, '').trim();
  cleaned = cleaned.replace(/```(?:json|suiji|mneme)?/gi, '');
  cleaned = cleaned.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, reason: 'no-json', block, inner };

  try {
    const raw = JSON.parse(cleaned.slice(start, end + 1));
    const delta = normalizeDelta(raw);
    return delta ? { ok: true, delta, block, inner } : { ok: false, reason: 'invalid', block, inner };
  } catch {
    return { ok: false, reason: 'bad-json', block, inner };
  }
}

function normalizeDelta(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let rawMemory = '';
  let memImp;
  if (typeof raw.memory === 'object' && raw.memory !== null) {
    rawMemory = asString(raw.memory.summary ?? raw.memory.text ?? raw.memory.content);
    if (['normal', 'major', 'permanent'].includes(raw.memory.importance)) {
      memImp = raw.memory.importance;
    }
  } else {
    rawMemory = asString(raw.memory ?? raw.summary ?? raw.记忆 ?? raw.摘要);
  }
  const storyTime = asString(raw.storyTime ?? raw.time ?? raw.时间);
  const location = asString(raw.location ?? raw.place ?? raw.地点);
  let importance = memImp || (['normal', 'major', 'permanent'].includes(raw.importance) ? raw.importance : 'normal');
  let summary = rawMemory;
  const tagMatch = summary.match(/^(?:\[|【)(普通|重要|永久|normal|major|permanent)(?:\]|】)\s*/i);
  if (tagMatch) {
    const t = tagMatch[1].toLowerCase();
    if (t === '重要' || t === 'major') importance = 'major';
    else if (t === '永久' || t === 'permanent') importance = 'permanent';
    else importance = 'normal';
    summary = summary.slice(tagMatch[0].length).trim();
  }
  if (summary && (storyTime || location) && !summary.startsWith('【')) {
    const prefix = [storyTime, location].filter(Boolean).join('·');
    if (prefix && !summary.includes(prefix)) summary = `【${prefix}】${summary}`;
  }

  const bondsRaw = Array.isArray(raw.bonds ?? raw.羁绊) ? (raw.bonds ?? raw.羁绊) : [];
  const bonds = bondsRaw
    .map((b) => {
      if (!b || typeof b !== 'object') return null;
      const name = asString(b.name ?? b.角色 ?? b.character);
      if (!name) return null;
      const d = Number(b.delta ?? b.change ?? b.变动 ?? 0);
      const sRaw = b.score ?? b.好感 ?? b.好感度;
      const sNum = sRaw !== undefined && sRaw !== null ? Number(sRaw) : undefined;
      const majorEvent = asString(b.majorEvent ?? b.major_event ?? b.重大事件);
      const legacyEvent = asString(b.event ?? b.事件);
      return {
        name,
        delta: Number.isFinite(d) ? roundDecimal(d, 1) : 0,
        score: sNum !== undefined && Number.isFinite(sNum) ? roundDecimal(sNum, 1) : undefined,
        relation: asString(b.relation ?? b.relationship ?? b.关系) || undefined,
        impression: asString(b.impression ?? b.印象) || undefined,
        majorEvent: majorEvent || undefined,
        event: majorEvent || legacyEvent || undefined,
      };
    })
    .filter(Boolean);

  const itemsRaw = Array.isArray(raw.items ?? raw.道具) ? (raw.items ?? raw.道具) : [];
  const items = itemsRaw
    .map((it) => {
      if (!it || typeof it !== 'object') return null;
      const name = asString(it.name ?? it.物品 ?? it.item);
      if (!name) return null;
      const actRaw = asString(it.action ?? it.status ?? 'gain').toLowerCase();
      let action = 'gain';
      if (['give', 'gifted', '赠送', '赠出', '送出'].includes(actRaw)) action = 'give';
      else if (['lose', 'lost', '遗失'].includes(actRaw)) action = 'lose';
      else if (['consume', 'consumed', '消耗'].includes(actRaw)) action = 'consume';
      else if (['change', 'update', '更新', '状态更新'].includes(actRaw)) action = 'change';
      const desc = asString(it.desc ?? it.description ?? it.detail ?? it.effect ?? it.详情 ?? it.作用);
      return {
        action,
        name,
        holder: asString(it.holder ?? it.owner ?? it.持有者) || undefined,
        condition: asString(it.state ?? it.condition ?? it.itemState ?? it.当前状态) || undefined,
        source: asString(it.source ?? it.from ?? it.来源 ?? it.去向) || undefined,
        effect: desc || undefined,
        description: desc || undefined,
      };
    })
    .filter(Boolean);

  const eventsRaw = Array.isArray(raw.events ?? raw.importantEvents ?? raw.重要事件)
    ? (raw.events ?? raw.importantEvents ?? raw.重要事件)
    : [];
  const events = eventsRaw
    .map((ev) => {
      if (!ev) return null;
      if (typeof ev === 'string') {
        const c = ev.trim();
        return c ? { title: c.slice(0, 18), category: '重大事件', content: c, characters: [] } : null;
      }
      if (typeof ev !== 'object') return null;
      const title = asString(ev.title ?? ev.name ?? ev.标题);
      const content = asString(ev.content ?? ev.summary ?? ev.description ?? ev.内容);
      if (!title && !content) return null;
      return {
        title: title || content.slice(0, 18),
        category: asString(ev.category ?? ev.type ?? ev.分类) || '重大事件',
        content: content || title,
        characters: Array.isArray(ev.characters ?? ev.participants)
          ? (ev.characters ?? ev.participants).filter((x) => typeof x === 'string').map((s) => s.trim()).filter(Boolean)
          : [],
      };
    })
    .filter(Boolean);

  const seal = raw.seal && typeof raw.seal === 'object' ? raw.seal : undefined;
  const epochRaw = raw.epoch ?? raw.compendium ?? raw.总卷;
  const epoch = epochRaw && typeof epochRaw === 'object' ? epochRaw : undefined;

  if (!summary && bonds.length === 0 && items.length === 0 && events.length === 0 && !seal && !epoch) {
    return null;
  }

  return {
    summary,
    storyTime: '',
    location: '',
    characters: Array.isArray(raw.characters) ? raw.characters.filter((x) => typeof x === 'string') : [],
    result: asString(raw.result),
    importance,
    anchor: asString(raw.anchor) || undefined,
    bonds,
    items,
    events,
    seal,
    epoch,
  };
}

// 卷宗与总卷格式化
function formatEntryUnified(entry) {
  const summary = String(entry.summary ?? '').trim();
  const time = String(entry.storyTime ?? '').trim();
  const loc = String(entry.location ?? '').trim();
  if (summary.startsWith('【')) return summary;
  const prefix = [time, loc].filter(Boolean).join('·');
  const body = `${prefix ? `【${prefix}】` : ''}${summary}`;
  const result = String(entry.result ?? '').trim();
  return result && !summary.includes(result) ? `${body}（结果：${result}）` : body;
}

function extractEntryBracketTime(entry) {
  const time = String(entry.storyTime ?? '').trim();
  if (time) return time;
  const match = String(entry.summary ?? '').match(/^【([^】·]+)(?:·[^】]+)?】/);
  return match ? match[1].trim() : '';
}

function inferVolumeTimeRange(entries) {
  const times = entries.map(extractEntryBracketTime).filter(Boolean);
  if (times.length === 0) return '';
  const first = times[0];
  const last = times[times.length - 1];
  return first === last ? first : `${first}-${last}`;
}

function formatVolumeRecap(timeRange, recap) {
  const cleanRecap = String(recap ?? '').trim();
  const cleanRange = String(timeRange ?? '').trim();
  if (!cleanRecap) return cleanRange ? `【${cleanRange}】` : '';
  if (cleanRecap.startsWith('【')) return cleanRecap;
  if (cleanRange) return `【${cleanRange}】${cleanRecap}`;
  return cleanRecap;
}

function sealVolume(state, index, entries, provided) {
  const inferredRange = inferVolumeTimeRange(entries);
  const providedTitle = provided?.title?.trim();
  const providedRange = (provided?.timeRange ?? provided?.time_range ?? '').trim();
  const providedRecap = provided?.recap?.trim();
  const timeRange = providedRange || inferredRange;
  if (providedTitle && providedRecap) {
    return {
      index,
      title: providedTitle.slice(0, 24),
      timeRange,
      recap: formatVolumeRecap(timeRange, providedRecap).slice(0, 600),
      entries,
      sealedAt: Date.now(),
      auto: false,
    };
  }
  const bodyLines = entries.map((e) => formatEntryUnified(e).replace(/^【[^】]+】\s*/, '').trim()).filter(Boolean);
  const rangePrefix = timeRange ? `【${timeRange}】` : '【本卷纪要】';
  return {
    index,
    title: providedTitle ? providedTitle.slice(0, 24) : `第 ${index} 卷`,
    timeRange,
    recap: `${rangePrefix}这些日子里，${bodyLines.join('；')}。`.slice(0, 600),
    entries,
    sealedAt: Date.now(),
    auto: true,
  };
}

function sealEpoch(index, volumes, provided) {
  const times = [];
  for (const v of volumes) {
    const r = String(v.timeRange ?? '').trim();
    if (r) {
      const parts = r.split(/\s*[-~～至]\s*/).filter(Boolean);
      times.push(...parts);
    }
  }
  const inferredRange = times.length > 0 ? (times[0] === times[times.length - 1] ? times[0] : `${times[0]}-${times[times.length - 1]}`) : '';
  const providedTitle = provided?.title?.trim();
  const providedRange = (provided?.timeRange ?? provided?.time_range ?? '').trim();
  const providedRecap = provided?.recap?.trim();
  const timeRange = providedRange || inferredRange;
  if (providedTitle && providedRecap) {
    return {
      index,
      title: providedTitle.slice(0, 28),
      timeRange,
      recap: formatVolumeRecap(timeRange, providedRecap).slice(0, 1000),
      volumes,
      sealedAt: Date.now(),
      auto: false,
    };
  }
  const pieces = volumes.map((v) => `《${v.title}》：${String(v.recap ?? '').replace(/^【[^】]+】\s*/, '').trim()}`);
  const rangePrefix = timeRange ? `【${timeRange}】` : '【总卷纪要】';
  return {
    index,
    title: providedTitle ? providedTitle.slice(0, 28) : `第 ${index} 部总卷`,
    timeRange,
    recap: `${rangePrefix}这一阶段历程汇总：${pieces.join('；')}。`.slice(0, 1000),
    volumes,
    sealedAt: Date.now(),
    auto: true,
  };
}

// 快照回退与增量应用
function captureSnapshot(state) {
  return {
    bonds: cloneData(state.bonds),
    items: cloneData(state.items),
    importantEvents: cloneData(state.importantEvents ?? []),
  };
}

function rollbackEntryEffects(state, entry) {
  if (entry.prevSnapshot) {
    state.bonds = cloneData(entry.prevSnapshot.bonds);
    state.items = cloneData(entry.prevSnapshot.items);
    state.importantEvents = cloneData(entry.prevSnapshot.importantEvents ?? []);
    return;
  }
  const eid = entry.id;
  const mid = entry.messageId;
  for (const name of Object.keys(state.bonds)) {
    const bond = state.bonds[name];
    bond.events = bond.events.filter((ev) => ev.entryId !== eid && ev.messageId !== mid);
  }
  state.items = state.items.filter((it) => it.entryId !== eid && it.messageId !== mid);
  state.importantEvents = (state.importantEvents ?? []).filter((ev) => ev.entryId !== eid && ev.messageId !== mid);
}

function applyDelta(current, delta, opts) {
  const state = cloneData(current);
  if (!Array.isArray(state.importantEvents)) state.importantEvents = [];
  if (!Array.isArray(state.epochs)) state.epochs = [];

  const volumeSize = Math.min(30, Math.max(5, Math.round(Number(opts.volumeSize) || 10)));
  const epochSize = Math.min(30, Math.max(2, Math.round(Number(opts.epochSize) || 10)));
  const enableMemory = opts.enableMemory !== false;
  const enableBonds = opts.enableBonds !== false;
  const enableItems = opts.enableItems !== false;
  const enableEvents = opts.enableEvents !== false;
  const now = opts.now ?? Date.now();

  let existingIdx = state.entries.findIndex((e) => e.messageId === opts.messageId);
  let baseSnapshot;
  if (existingIdx >= 0) {
    const prevEntry = state.entries[existingIdx];
    baseSnapshot = prevEntry.prevSnapshot ? cloneData(prevEntry.prevSnapshot) : undefined;
    rollbackEntryEffects(state, prevEntry);
    existingIdx = state.entries.findIndex((e) => e.messageId === opts.messageId);
  }
  if (!baseSnapshot) baseSnapshot = captureSnapshot(state);

  const volumeNumber = state.stats.sealedVolumes + 1;
  const entryId = existingIdx >= 0 ? state.entries[existingIdx].id : `m${opts.messageId}-s${opts.swipeId}-${now.toString(36)}`;
  const unifiedSummary = formatEntryUnified({
    summary: delta.summary || '',
    storyTime: delta.storyTime || '',
    location: delta.location || '',
    result: delta.result || '',
  });
  const entry = {
    id: entryId,
    messageId: opts.messageId,
    swipeId: opts.swipeId,
    mesHash: opts.mesHash,
    at: now,
    storyTime: '',
    location: '',
    summary: unifiedSummary,
    characters: delta.importance === 'normal' ? [] : (delta.characters ?? []),
    result: '',
    importance: delta.importance ?? 'normal',
    anchor: delta.importance === 'normal' ? undefined : delta.anchor,
    volume: volumeNumber,
    source: 'model',
    prevSnapshot: baseSnapshot,
  };

  if (enableMemory && unifiedSummary) {
    if (existingIdx >= 0) {
      state.entries[existingIdx] = entry;
    } else {
      state.entries.push(entry);
      state.stats.totalEntries += 1;
    }
  } else if (existingIdx >= 0) {
    state.entries.splice(existingIdx, 1);
  }

  if (enableBonds && Array.isArray(delta.bonds)) {
    for (const b of delta.bonds) {
      const name = String(b.name ?? '').trim();
      if (!name) continue;
      const existing = state.bonds[name] ?? {
        name,
        initialScore: 0,
        manualDelta: 0,
        relation: '',
        impression: '',
        events: [],
        updatedAt: now,
        entryId,
        messageId: opts.messageId,
      };
      const deltaVal = roundDecimal(Number(b.delta) || 0, 1);
      const majorText = String(b.majorEvent ?? '').trim();
      if (majorText) {
        existing.events.push({
          id: `${entryId}-b-${existing.events.length}`,
          text: majorText,
          delta: deltaVal,
          importance: 'major',
          at: now,
          entryId,
          messageId: opts.messageId,
          major: true,
        });
      } else if (deltaVal !== 0) {
        existing.manualDelta = roundDecimal((existing.manualDelta || 0) + deltaVal, 1);
      }
      if (b.score !== undefined && Number.isFinite(b.score)) {
        const currentTotal = bondScore(existing);
        const diff = roundDecimal(b.score - currentTotal, 1);
        if (Math.abs(diff) >= 0.1) existing.manualDelta = roundDecimal((existing.manualDelta || 0) + diff, 1);
      }
      if (b.relation && b.relation.trim()) existing.relation = b.relation.trim();
      if (b.impression && b.impression.trim()) existing.impression = b.impression.trim();
      existing.updatedAt = now;
      state.bonds[name] = existing;
    }
  }

  if (enableItems && Array.isArray(delta.items)) {
    for (const it of delta.items) {
      const name = String(it.name ?? '').trim();
      if (!name) continue;
      const existing = state.items.find((x) => x.name === name);
      const desc = (it.description ?? it.effect ?? '').trim();
      const cond = String(it.condition ?? '').trim();
      const holder = String(it.holder ?? '').trim();
      const src = String(it.source ?? '').trim();
      if (it.action === 'gain') {
        if (existing) {
          existing.status = 'held';
          if (holder) existing.holder = holder;
          if (cond) existing.condition = cond;
          if (src) existing.source = src;
          if (desc) existing.effect = desc;
        } else {
          state.items.push({
            id: `${entryId}-i-${state.items.length}`,
            name,
            holder: holder || 'user',
            condition: cond || '完好',
            source: src,
            effect: desc,
            status: 'held',
            acquiredAt: now,
            entryId,
            messageId: opts.messageId,
          });
        }
      } else if (it.action === 'give') {
        if (existing) {
          existing.status = 'gifted';
          if (holder) existing.holder = holder;
          if (cond) existing.condition = cond;
          if (src) existing.source = src;
          if (desc) existing.effect = desc;
        } else {
          state.items.push({
            id: `${entryId}-i-${state.items.length}`,
            name,
            holder,
            condition: cond || '已赠出',
            source: src,
            effect: desc,
            status: 'gifted',
            acquiredAt: now,
            entryId,
            messageId: opts.messageId,
          });
        }
      } else if (existing) {
        if (it.action === 'lose') existing.status = 'lost';
        if (it.action === 'consume') existing.status = 'consumed';
        if (holder) existing.holder = holder;
        if (cond) existing.condition = cond;
        if (src) existing.source = src;
        if (desc) existing.effect = desc;
      }
    }
  }

  if (enableEvents && Array.isArray(delta.events)) {
    for (const ev of delta.events) {
      const title = String(ev.title ?? '').trim();
      const content = String(ev.content ?? '').trim();
      if (!title && !content) continue;
      const category = String(ev.category ?? '重大事件').trim() || '重大事件';
      const dup = state.importantEvents.find((x) => x.title === (title || content.slice(0, 18)));
      if (dup) {
        dup.category = category;
        dup.content = content || title;
        dup.at = now;
      } else {
        state.importantEvents.push({
          id: `${entryId}-ev-${state.importantEvents.length}`,
          title: title || content.slice(0, 18),
          category,
          content: content || title,
          characters: Array.isArray(ev.characters) ? ev.characters : [],
          at: now,
          entryId,
          messageId: opts.messageId,
        });
      }
    }
  }

  let sealed;
  let sealedEpoch;
  if (enableMemory && state.entries.length >= volumeSize) {
    const toSeal = state.entries.splice(0, volumeSize);
    sealed = sealVolume(state, volumeNumber, toSeal, delta.seal);
    state.volumes.push(sealed);
    state.stats.sealedVolumes = volumeNumber;

    if (state.volumes.length >= epochSize) {
      const volsToMerge = state.volumes.splice(0, epochSize);
      const nextEpochIdx = (state.stats.sealedEpochs ?? state.epochs.length) + 1;
      sealedEpoch = sealEpoch(nextEpochIdx, volsToMerge, delta.epoch);
      state.epochs.push(sealedEpoch);
      state.stats.sealedEpochs = nextEpochIdx;
    }
  }

  return { state, entry, sealed, sealedEpoch };
}

function removeEntryAndRollback(current, entryId) {
  const state = cloneData(current);
  const idx = state.entries.findIndex((e) => e.id === entryId);
  if (idx < 0) return state;
  const [removed] = state.entries.splice(idx, 1);
  if (idx === state.entries.length) {
    rollbackEntryEffects(state, removed);
  }
  return state;
}

function reconcileState(current, chat) {
  const state = cloneData(current);
  if (!Array.isArray(chat) || chat.length === 0) {
    return { state, dropped: [], remapped: 0 };
  }
  const hashes = chat.map((m) => hashText(stripDelta(String(m?.mes ?? '')).text));
  const used = new Set();
  const kept = [];
  const dropped = [];
  let remapped = 0;

  for (const entry of state.entries) {
    if (entry.source === 'manual') {
      kept.push(entry);
      continue;
    }
    const direct = entry.messageId;
    if (direct >= 0 && direct < chat.length && hashes[direct] === entry.mesHash && !used.has(direct)) {
      used.add(direct);
      kept.push(entry);
      continue;
    }
    let found = -1;
    for (let i = chat.length - 1; i >= 0; i -= 1) {
      if (!used.has(i) && hashes[i] === entry.mesHash) {
        found = i;
        break;
      }
    }
    if (found >= 0) {
      used.add(found);
      if (found !== entry.messageId) {
        entry.messageId = found;
        remapped += 1;
      }
      kept.push(entry);
      continue;
    }
    if (direct >= chat.length) {
      dropped.push(entry);
    } else {
      kept.push(entry);
    }
  }

  if (dropped.length > 0) {
    dropped.sort((a, b) => b.messageId - a.messageId);
    for (const d of dropped) rollbackEntryEffects(state, d);
  }
  state.entries = kept;
  return { state, dropped: dropped.map((d) => d.id), remapped };
}

// 提示词拼装与预算控制
function estimateTokens(text) {
  let cjk = 0;
  let other = 0;
  for (const ch of String(text ?? '')) {
    if (/[㐀-鿿豈-﫿　-〿＀-￯]/.test(ch)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk + other / 4);
}

function defaultSealPrompt() {
  return [
    '当前卷记忆已满，请在本次 JSON 中额外附带 "seal" 字段对本卷进行归档总结：',
    '"seal": {',
    '  "title": "四到八字卷名",',
    '  "timeRange": "xx年xx月xx日-xx年xx月xx日",',
    '  "recap": "【xx年xx月xx日-xx年xx月xx日】用连贯流畅的叙事总结这些日子里发生了什么事、关键转折与最终结果（150-300字，切勿逐条罗列流水账）"',
    '}',
  ].join('\n');
}

function defaultEpochPrompt() {
  return [
    '已封存卷宗已达到合并阈值，请在本次 JSON 中额外附带 "epoch" 字段，将近期各卷合并总结为一部总卷：',
    '"epoch": {',
    '  "title": "四到八字总卷名",',
    '  "timeRange": "xx年xx月xx日-xx年xx月xx日",',
    '  "recap": "【xx年xx月xx日-xx年xx月xx日】用连贯宏大的叙事总结这一阶段（多卷跨度）内发生的核心主线脉络、人物命运转折与最终格局（200-400字）"',
    '}',
  ].join('\n');
}

function defaultSummaryPrompt(modules = {}) {
  const mem = modules.enableMemory !== false;
  const bonds = modules.enableBonds !== false;
  const items = modules.enableItems !== false;
  const events = modules.enableEvents !== false;
  const jsonFields = [];
  const rules = [];
  let step = 1;

  if (mem) {
    jsonFields.push(
      '  "summary": "【xx年xx月xx日（具体时间）·xx地点】用紧凑流畅的一段话记录本轮发生的事件与结果（30-80字）",\n  "importance": "normal"',
    );
    rules.push(
      `${step++}. summary 与 importance：summary 必须包含具体年月日，按「【xx年xx月xx日（时间）·xx地点】发生了什么事」一段话写清；importance 填 "normal"（普通日常）、"major"（重要剧情转折）或 "permanent"（永久关键记忆）。`,
    );
  }
  if (bonds) {
    jsonFields.push(
      [
        '  "bonds": [',
        '    {',
        '      "name": "角色名",',
        '      "delta": 0.5,',
        '      "relation": "当前与user的关系（无变化填 \\"\\"）",',
        '      "impression": "当前对user的印象（无变化填 \\"\\"）",',
        '      "majorEvent": "仅在发生重大好感转折事件时填写简述，日常小幅加减分统一填 \\"\\""',
        '    }',
        '  ]',
      ].join('\n'),
    );
    rules.push(
      `${step++}. bonds：遵循角色卡好感规则，delta 支持小数（如 0.5、-1.2）。若某项字符串（如 majorEvent、relation、impression）本轮未发生或无变化，请保留字段并填 ""（空字符串）；若本轮没有任何角色好感或关系变化，"bonds" 填 []（空数组）。`,
    );
  }
  if (items) {
    jsonFields.push(
      [
        '  "items": [',
        '    {',
        '      "action": "gain|give|update|consume|lose",',
        '      "name": "物品名",',
        '      "holder": "当前持有者",',
        '      "state": "当前状态（如：完好/已开启）",',
        '      "source": "来源或赠送去向",',
        '      "description": "物品外观、来历与具体作用详情"',
        '    }',
        '  ]',
      ].join('\n'),
    );
    rules.push(
      `${step++}. items：获得填 "gain"，user 送给他人填 "give"，状态变化填 "update"，消耗填 "consume"，遗失填 "lose"；若本轮无任何物品变动，"items" 统一填 []（空数组）。`,
    );
  }
  if (events) {
    jsonFields.push(
      [
        '  "events": [',
        '    {',
        '      "category": "约定|誓言|束缚|重大事件",',
        '      "title": "简短标题",',
        '      "content": "具体条款或事件前因后果"',
        '    }',
        '  ]',
      ].join('\n'),
    );
    rules.push(
      `${step++}. events：仅在立下约定/誓言/束缚，或发生救人、杀敌、改变命运等重大事件时填写；若本轮无此类事件，"events" 统一填 []（空数组）。`,
    );
  }
  if (jsonFields.length === 0) return '';
  return [
    '请在正文完全结束后，在末尾另起一行附上且仅附上一个 HTML 注释块（严格使用标准双引号 JSON；未发生的字符串字段填 ""，无变动的数组字段填 []）：',
    '<!--SUIJI',
    '{',
    jsonFields.join(',\n'),
    '}',
    'SUIJI-->',
    '填写说明：',
    ...rules,
  ].join('\n');
}

function renderEntryLine(entry) {
  const mark = entry.importance === 'permanent' ? '★' : entry.importance === 'major' ? '◆' : '';
  const body = formatEntryUnified(entry);
  const anchor = entry.anchor ? `（锚点：${entry.anchor}）` : '';
  return `${mark}${body}${anchor}`;
}

function buildInjection(state, settings) {
  if (!state) return '';
  const enableMemory = settings.enableMemory !== false;
  const enableBonds = settings.enableBonds !== false;
  const enableItems = settings.enableItems !== false;
  const enableEvents = settings.enableEvents !== false;

  const permanent = [];
  const recent = [];
  for (const e of state.entries) {
    if (e.importance === 'permanent') permanent.push(e);
    else recent.push(e);
  }
  const archivedPermanent = [];
  const archivedMajor = [];
  const allVolumes = [...(state.epochs ?? []).flatMap((ep) => ep.volumes ?? []), ...(state.volumes ?? [])];
  const firstMajorVol = state.stats.sealedVolumes - settings.majorRetentionVolumes + 1;
  for (const v of allVolumes) {
    for (const e of v.entries ?? []) {
      if (e.importance === 'permanent') archivedPermanent.push(e);
      else if (e.importance === 'major' && v.index >= firstMajorVol) archivedMajor.push(e);
    }
  }

  const sections = [];
  if (enableEvents && Array.isArray(state.importantEvents) && state.importantEvents.length > 0) {
    const lines = state.importantEvents.map((ev) => `★【${ev.category || '重大事件'}】${ev.title ? `${ev.title}：` : ''}${ev.content}`);
    sections.push({
      key: 'importantEvents',
      text: `<岁记·重要事件与誓言>\n${lines.join('\n')}\n</岁记·重要事件与誓言>`,
      priority: 98,
      required: true,
    });
  }

  if (enableMemory) {
    const permAll = [...permanent, ...archivedPermanent];
    if (permAll.length > 0) {
      sections.push({
        key: 'permanent',
        text: `<岁记·永久记忆>\n${permAll.map(renderEntryLine).join('\n')}\n</岁记·永久记忆>`,
        priority: 95,
        required: true,
      });
    }
    recent.forEach((e, idx) => {
      sections.push({ key: `recent-${e.id}`, text: renderEntryLine(e), priority: 50 + idx, required: true });
    });
    if (archivedMajor.length > 0) {
      sections.push({
        key: 'major',
        text: `<岁记·重要记忆>\n${archivedMajor.map(renderEntryLine).join('\n')}\n</岁记·重要记忆>`,
        priority: 70,
        required: false,
      });
    }
    const epochLines = (state.epochs ?? [])
      .slice(-3)
      .map((ep) => `第${ep.index}部总卷·《${ep.title}》：${formatVolumeRecap(ep.timeRange, ep.recap)}`)
      .join('\n');
    if (epochLines) {
      sections.push({ key: 'epochs', text: `<岁记·总卷>\n${epochLines}\n</岁记·总卷>`, priority: 42, required: false });
    }
    const volLines = (state.volumes ?? [])
      .slice(-5)
      .map((v) => `第${v.index}卷·《${v.title}》：${formatVolumeRecap(v.timeRange, v.recap)}`)
      .join('\n');
    if (volLines) {
      sections.push({ key: 'volumes', text: `<岁记·卷宗>\n${volLines}\n</岁记·卷宗>`, priority: 40, required: false });
    }
  }

  if (enableBonds) {
    const bondLines = Object.values(state.bonds).map((bond) => {
      const score = bondScore(bond);
      const relation = bondRelation(bond);
      const impression = bond.impressionOverride ?? bond.impression;
      const majorEvents = (bond.events ?? [])
        .slice(-3)
        .map((e) => `${e.text}（${e.delta >= 0 ? '+' : ''}${e.delta}）`)
        .join('；');
      return [
        `${bond.name}｜好感 ${score}`,
        relation ? `关系：${relation}` : '',
        `印象：${impression || '暂无'}`,
        majorEvents ? `重大事件：${majorEvents}` : '',
      ]
        .filter(Boolean)
        .join('｜');
    });
    if (bondLines.length > 0) {
      sections.push({ key: 'bonds', text: `<岁记·羁绊>\n${bondLines.join('\n')}\n</岁记·羁绊>`, priority: 80, required: false });
    }
  }

  if (enableItems) {
    const itemLines = (state.items ?? [])
      .filter((it) => it.status === 'held' || it.status === 'gifted')
      .map((it) => {
        const st = it.status === 'gifted' ? '已赠出' : '持有中';
        const cond = it.condition ? `；状态：${it.condition}` : '';
        const holder = it.holder ? `；持有者：${it.holder}` : '';
        return `${it.name}［${st}${cond}${holder}；来源/去向：${it.source || '未知'}；详情：${it.effect || '未知'}］`;
      });
    if (itemLines.length > 0) {
      sections.push({ key: 'items', text: `<岁记·道具>\n${itemLines.join('\n')}\n</岁记·道具>`, priority: 45, required: false });
    }
  }

  if (enableMemory || enableBonds || enableItems || enableEvents) {
    const size = settings.volumeSize;
    const epSize = settings.epochSize ?? 10;
    const count = state.entries.length + 1;
    const needSeal = enableMemory && count >= size;
    const needEpoch = needSeal && state.volumes.length + 1 >= epSize;
    const staticPart =
      (settings.summaryPrompt ?? '').trim() ||
      defaultSummaryPrompt({ enableMemory, enableBonds, enableItems, enableEvents });
    const sealInst = (settings.sealPrompt ?? '').trim() || defaultSealPrompt();
    const epochInst = (settings.epochPrompt ?? '').trim() || defaultEpochPrompt();
    const dynamic = [
      enableMemory
        ? needSeal
          ? `- 本条是当前卷第 ${size} 条（已满卷）：\n${sealInst}`
          : `- 当前卷进度：${count - 1}/${size} 条（已封卷宗：${state.volumes.length}/${epSize} 卷）。`
        : '',
      needEpoch ? `- 本卷封存后已满 ${epSize} 卷：\n${epochInst}` : '',
      '不要在正文中复述上述记录要求。',
    ]
      .filter(Boolean)
      .join('\n');
    if (staticPart) {
      sections.push({
        key: 'instruction',
        text: `<岁记·记录要求>\n${staticPart}\n${dynamic}\n</岁记·记录要求>`,
        priority: 999,
        required: true,
      });
    }
  }

  const active = sections.filter((s) => s.text);
  const dropOrder = active.filter((s) => !s.required).sort((a, b) => a.priority - b.priority);
  const calcTotal = () => estimateTokens(active.filter((s) => s.text).map((s) => s.text).join('\n'));
  let used = calcTotal();
  for (const s of dropOrder) {
    if (used <= settings.tokenBudget) break;
    s.text = '';
    used = calcTotal();
  }

  const byKey = new Map(active.map((s) => [s.key, s]));
  const recentText = active
    .filter((s) => s.key.startsWith('recent-') && s.text)
    .map((s) => s.text)
    .join('\n');

  return [
    byKey.get('importantEvents')?.text,
    byKey.get('permanent')?.text,
    recentText ? `<岁记·近期记忆>\n${recentText}\n</岁记·近期记忆>` : '',
    byKey.get('major')?.text,
    byKey.get('epochs')?.text,
    byKey.get('volumes')?.text,
    byKey.get('bonds')?.text,
    byKey.get('items')?.text,
    byKey.get('instruction')?.text,
  ]
    .filter(Boolean)
    .join('\n');
}

// 宿主事件与魔法棒按钮
function setWandDot(on) {
  if (typeof document === 'undefined') return;
  const dot = document.getElementById('suiji-wand-dot');
  if (dot) dot.style.display = on ? 'inline-block' : 'none';
}

function ensureWandButton(onClick, tries = 120) {
  if (typeof document === 'undefined') return;
  const menu = document.getElementById('extensionsMenu') ?? document.querySelector('#extensionsMenu');
  if (!menu) {
    if (tries > 0) setTimeout(() => ensureWandButton(onClick, tries - 1), 500);
    return;
  }
  if (document.getElementById('suiji-wand')) return;

  const container = document.createElement('div');
  container.className = 'extension_container interactable';
  container.id = 'suiji-wand';

  const button = document.createElement('div');
  button.className = 'list-group-item flex-container flexGap5 interactable';
  button.setAttribute('role', 'button');
  button.tabIndex = 0;

  const icon = document.createElement('div');
  icon.className = 'fa-solid fa-scroll extensionsMenuExtensionButton';

  const label = document.createElement('span');
  label.textContent = '岁记';

  const dot = document.createElement('span');
  dot.id = 'suiji-wand-dot';
  dot.className = 'mneme-badge-dot';
  dot.style.display = 'none';

  button.append(icon, label, dot);
  button.addEventListener('click', onClick);
  button.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') onClick();
  });

  container.appendChild(button);
  menu.appendChild(container);
}

function getCurrentInjectionText() {
  if (!store.state) return '';
  const settings = readSettings();
  if (!settings.enabled) return '';
  return buildInjection(store.state, settings);
}

function refreshInjection() {
  const ctx = getCtx();
  if (!ctx) return;
  ensureStateForChat();
  const settings = readSettings();
  if (!settings.enabled || !store.state) {
    try {
      ctx.setExtensionPrompt?.('suiji', '', 1, 1, false, 0);
    } catch {}
    return;
  }
  const text = buildInjection(store.state, settings);
  try {
    ctx.setExtensionPrompt?.('suiji', text, 1, 1, false, 0);
  } catch (err) {
    console.warn('[岁记] inject failed', err);
  }
}

async function onMessageReceived(messageId, type) {
  const ctx = getCtx();
  if (!ctx || !ctx.chatMetadata) return;
  const state = ensureStateForChat();
  if (!state || type === 'first_message' || type === 'command') return;
  const settings = readSettings();
  if (!settings.enabled) return;

  const message = ctx.chat?.[messageId];
  if (!message || message.is_user) return;
  const original = String(message.mes ?? '');
  const parsed = parseDelta(original);
  if (!parsed.ok && !parsed.block) {
    if (settings.showMissingBadge) {
      panelState.missing += 1;
      setWandDot(true);
      panelState.ballDot = true;
      renderApp();
    }
    return;
  }
  const stripped = stripDelta(original);
  const cleanText = stripped.text;
  const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
  const delta =
    parsed.ok && parsed.delta
      ? parsed.delta
      : { summary: `（原始记录）${String(parsed.inner ?? '').slice(0, 400)}`, importance: 'normal' };

  const result = applyDelta(state, delta, {
    messageId,
    swipeId,
    mesHash: hashText(cleanText),
    volumeSize: settings.volumeSize,
    epochSize: settings.epochSize ?? 10,
    enableMemory: settings.enableMemory !== false,
    enableBonds: settings.enableBonds !== false,
    enableItems: settings.enableItems !== false,
    enableEvents: settings.enableEvents !== false,
  });

  if (!parsed.ok) {
    result.entry.source = 'raw';
    panelState.raw += 1;
    setWandDot(true);
    panelState.ballDot = true;
  }

  if (settings.autoStripBlock !== false && stripped.removed) {
    message.mes = cleanText;
    if (Array.isArray(message.swipes) && message.swipes[swipeId] !== undefined) {
      message.swipes[swipeId] = cleanText;
    }
    try {
      ctx.updateMessageBlock?.(messageId, message, { rerenderMessage: true });
      ctx.saveChatDebounced?.();
      ctx.saveChatConditional?.();
    } catch {}
  }

  if (result.sealed) {
    panelState.lastSealed = result.sealed.index;
    setWandDot(true);
    panelState.ballDot = true;
  }

  commitState(result.state);
  refreshInjection();
  await flushState();
}

async function onMessageEdited(messageId) {
  const ctx = getCtx();
  if (!ctx || !store.state) return;
  const message = ctx.chat?.[messageId];
  if (!message) return;
  const settings = readSettings();
  const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
  const parsed = parseDelta(String(message.mes ?? ''));
  if (!parsed.ok || !parsed.delta) return;

  const stripped = stripDelta(String(message.mes ?? ''));
  const result = applyDelta(store.state, parsed.delta, {
    messageId,
    swipeId,
    mesHash: hashText(stripped.text),
    volumeSize: settings.volumeSize,
    epochSize: settings.epochSize ?? 10,
    enableMemory: settings.enableMemory !== false,
    enableBonds: settings.enableBonds !== false,
    enableItems: settings.enableItems !== false,
    enableEvents: settings.enableEvents !== false,
  });

  if (settings.autoStripBlock !== false && stripped.removed) {
    message.mes = stripped.text;
    if (Array.isArray(message.swipes) && message.swipes[swipeId] !== undefined) {
      message.swipes[swipeId] = stripped.text;
    }
    try {
      ctx.updateMessageBlock?.(messageId, message, { rerenderMessage: true });
      ctx.saveChatDebounced?.();
      ctx.saveChatConditional?.();
    } catch {}
  }

  commitState(result.state);
  refreshInjection();
  await flushState();
}

async function onMessageDeleted() {
  const ctx = getCtx();
  if (!ctx || !store.state) return;
  const result = reconcileState(store.state, ctx.chat ?? []);
  if (result.dropped.length === 0 && result.remapped === 0) return;
  commitState(result.state);
  refreshInjection();
  await flushState();
}

async function onChatChanged() {
  panelState.missing = 0;
  panelState.raw = 0;
  panelState.ballDot = false;
  loadFromChat();
  refreshInjection();
  renderApp();
}

let hostRegistered = false;
function initHost(retries = 40) {
  const ctx = getCtx();
  const events = ctx?.eventTypes ?? ctx?.event_types;
  if (!ctx || !ctx.eventSource || !events) {
    if (retries > 0) setTimeout(() => initHost(retries - 1), 250);
    return;
  }
  if (hostRegistered) return;
  hostRegistered = true;

  if (events.MESSAGE_RECEIVED) ctx.eventSource.on(events.MESSAGE_RECEIVED, (id, t) => void onMessageReceived(id, t));
  if (events.MESSAGE_EDITED) ctx.eventSource.on(events.MESSAGE_EDITED, (id) => void onMessageEdited(id));
  if (events.MESSAGE_DELETED) ctx.eventSource.on(events.MESSAGE_DELETED, () => void onMessageDeleted());
  if (events.MESSAGE_SWIPED) ctx.eventSource.on(events.MESSAGE_SWIPED, (id) => void onMessageEdited(id));
  if (events.CHAT_CHANGED) ctx.eventSource.on(events.CHAT_CHANGED, () => void onChatChanged());
  if (events.GENERATION_STARTED) ctx.eventSource.on(events.GENERATION_STARTED, () => refreshInjection());

  reloadSettings();
  loadFromChat();
  refreshInjection();
  renderApp();
}

// UI 状态与渲染
const uiLocal = {
  showFullPreview: false,
  showPrompt: false,
  showMemForm: false,
  showVolForm: false,
  showEpochForm: false,
  showBondForm: false,
  showItemForm: false,
  showEventForm: false,
  memQuery: '',
  itemFilter: 'all',
  eventFilter: 'all',
  editingEntryId: null,
  editingVolIdx: null,
  editingEpochIdx: null,
  editingBondName: null,
  editingItemId: null,
  editingEventId: null,
  summarizingVol: null,
  summarizingEpoch: null,
  confirmClear: false,
};

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function impLabel(imp) {
  if (imp === 'permanent') return '永久';
  if (imp === 'major') return '重要';
  return '普通';
}

function statusLabel(st) {
  if (st === 'gifted') return '已赠出';
  if (st === 'lost') return '已遗失';
  if (st === 'consumed') return '已消耗';
  return '持有中';
}

function renderMemoryTab() {
  const s = store.state;
  const injText = uiLocal.showFullPreview ? getCurrentInjectionText() : '';
  const tokens = uiLocal.showFullPreview ? estimateTokens(injText) : 0;
  const sumPrompt = settingsStore.summaryPrompt || defaultSummaryPrompt(settingsStore);
  const sealPrompt = settingsStore.sealPrompt || defaultSealPrompt();
  const epochPrompt = settingsStore.epochPrompt || defaultEpochPrompt();

  let html = `<div class="mneme-tab-body">
    <div class="mneme-row" style="justify-content:space-between">
      <label class="mneme-inline-toggle">
        <input type="checkbox" data-action="toggle-mod" data-mod="enableMemory" ${settingsStore.enableMemory !== false ? 'checked' : ''} />
        <span>启用记忆注入与读取</span>
      </label>
      <div class="mneme-row" style="gap:6px">
        <button class="mneme-btn mneme-btn-sm" type="button" data-action="toggle-preview">${uiLocal.showFullPreview ? '收起注入预览' : '完整注入预览'}</button>
        <button class="mneme-btn mneme-btn-sm" type="button" data-action="toggle-prompt">${uiLocal.showPrompt ? '收起提示词' : '提示词设置'}</button>
      </div>
    </div>`;

  if (uiLocal.showFullPreview) {
    html += `<div class="mneme-card">
      <div class="mneme-row" style="justify-content:space-between">
        <span class="mneme-muted">位置：IN_CHAT · depth=1 · system · 约 ${tokens} tokens / ${injText.length} 字</span>
        <button class="mneme-btn mneme-btn-sm" type="button" data-action="copy-preview">复制全文</button>
      </div>
      <pre class="mneme-debug" style="max-height:260px">${esc(injText || '（当前未启用插件或无注入内容）')}</pre>
    </div>`;
  }

  if (uiLocal.showPrompt) {
    html += `<div class="mneme-card">
      <div class="mneme-section-title" style="margin-top:0">1. 每轮记录提示词模板</div>
      <textarea id="suiji-prompt-summary" class="mneme-textarea" rows="7">${esc(sumPrompt)}</textarea>
      <div class="mneme-section-title">2. 封卷总结提示词（满 ${settingsStore.volumeSize} 条归档时触发）</div>
      <textarea id="suiji-prompt-seal" class="mneme-textarea" rows="4">${esc(sealPrompt)}</textarea>
      <div class="mneme-section-title">3. 总卷合并提示词（满 ${settingsStore.epochSize ?? 10} 卷合并时触发）</div>
      <textarea id="suiji-prompt-epoch" class="mneme-textarea" rows="4">${esc(epochPrompt)}</textarea>
      <div class="mneme-row">
        <button class="mneme-btn mneme-btn-sm" type="button" data-action="save-prompts">保存提示词</button>
        <button class="mneme-btn mneme-btn-sm" type="button" data-action="reset-prompts">恢复默认模板</button>
      </div>
    </div>`;
  }

  html += `<div class="mneme-row">
    <input id="suiji-mem-query" class="mneme-input" placeholder="搜索记忆内容…" value="${esc(uiLocal.memQuery)}" />
    <button class="mneme-btn mneme-btn-sm" type="button" data-action="toggle-mem-form">${uiLocal.showMemForm ? '收起' : '+ 新增记忆'}</button>
  </div>`;

  if (uiLocal.showMemForm) {
    html += `<div class="mneme-card">
      <textarea id="suiji-new-mem-text" class="mneme-textarea" rows="3" placeholder="按「【xx年xx月xx日（具体时间）·xx地点】发生了xx事」填写一段完整记忆"></textarea>
      <div class="mneme-row">
        <select id="suiji-new-mem-imp" class="mneme-input">
          <option value="normal">普通记忆 (normal)</option>
          <option value="major">重要记忆 (major)</option>
          <option value="permanent">永久记忆 (permanent)</option>
        </select>
        <button class="mneme-btn mneme-btn-sm" type="button" data-action="add-mem">保存记忆</button>
      </div>
    </div>`;
  }

  if (!s) {
    html += `<div class="mneme-empty">当前没有打开的聊天。</div></div>`;
    return html;
  }

  const q = uiLocal.memQuery.trim();
  const entries = s.entries.map((entry, i) => ({ entry, num: i + 1 })).filter((x) => !q || formatEntryUnified(x.entry).includes(q)).reverse();

  html += `<div class="mneme-row" style="justify-content:space-between">
    <div class="mneme-section-title" style="margin-top:0">一、当前卷（近期记忆） · ${s.entries.length}/${settingsStore.volumeSize}</div>
    ${s.entries.length > 0 ? `<button class="mneme-btn mneme-btn-sm" type="button" data-action="manual-seal">封存当前卷</button>` : ''}
  </div>`;

  if (entries.length === 0) {
    html += `<div class="mneme-empty">还没有记录。开始对话后会自动生成，也可点击上方「+ 新增记忆」手动添加。</div>`;
  } else {
    for (const { entry, num } of entries) {
      const text = formatEntryUnified(entry);
      const isEditing = uiLocal.editingEntryId === entry.id;
      html += `<details class="mneme-entry" ${num === s.entries.length || isEditing ? 'open' : ''}>
        <summary class="mneme-entry-summary">
          <div class="mneme-entry-headline">
            <span class="mneme-entry-number">#${num}</span>
            <span class="mneme-chip mneme-imp-${entry.importance}">${impLabel(entry.importance)}</span>
            <span class="mneme-entry-preview">${esc(text)}</span>
            <div class="mneme-entry-actions">
              <button class="mneme-link" type="button" data-action="edit-entry" data-id="${esc(entry.id)}">编辑</button>
              <button class="mneme-link danger" type="button" data-action="del-entry" data-id="${esc(entry.id)}">删除</button>
            </div>
          </div>
        </summary>
        ${
          isEditing
            ? `<div class="mneme-entry-edit">
                <textarea id="suiji-edit-entry-text" class="mneme-textarea" rows="3">${esc(text)}</textarea>
                <div class="mneme-row">
                  <select id="suiji-edit-entry-imp" class="mneme-input">
                    <option value="normal" ${entry.importance === 'normal' ? 'selected' : ''}>普通记忆</option>
                    <option value="major" ${entry.importance === 'major' ? 'selected' : ''}>重要记忆</option>
                    <option value="permanent" ${entry.importance === 'permanent' ? 'selected' : ''}>永久记忆</option>
                  </select>
                  <button class="mneme-btn mneme-btn-sm" type="button" data-action="save-entry" data-id="${esc(entry.id)}">保存</button>
                  <button class="mneme-btn mneme-btn-sm" type="button" data-action="cancel-entry">取消</button>
                </div>
              </div>`
            : `<div class="mneme-entry-content"><p class="mneme-entry-body">${esc(text)}</p></div>`
        }
      </details>`;
    }
  }

  // 二、已封卷宗
  const volumes = [...(s.volumes ?? [])].reverse();
  html += `<div class="mneme-row" style="justify-content:space-between;margin-top:8px">
    <div class="mneme-section-title" style="margin-top:0">二、已封卷宗 · ${volumes.length}/${settingsStore.epochSize ?? 10}</div>
    <div class="mneme-row" style="gap:6px">
      ${volumes.length > 0 ? `<button class="mneme-btn mneme-btn-sm" type="button" data-action="manual-epoch">合并为总卷</button>` : ''}
      <button class="mneme-btn mneme-btn-sm" type="button" data-action="toggle-vol-form">${uiLocal.showVolForm ? '收起' : '+ 新增卷宗'}</button>
    </div>
  </div>`;

  if (uiLocal.showVolForm) {
    html += `<div class="mneme-card">
      <div class="mneme-row">
        <input id="suiji-new-vol-title" class="mneme-input" placeholder="卷名（如：初入雾城）" />
        <input id="suiji-new-vol-range" class="mneme-input" placeholder="起止年月日" />
      </div>
      <textarea id="suiji-new-vol-recap" class="mneme-textarea" rows="3" placeholder="【xx年xx月xx日-xx年xx月xx日】这些日子里发生了什么事…"></textarea>
      <div class="mneme-row"><button class="mneme-btn mneme-btn-sm" type="button" data-action="add-vol">保存新卷宗</button></div>
    </div>`;
  }

  if (volumes.length === 0) {
    html += `<div class="mneme-empty">暂无已封存的卷宗。</div>`;
  } else {
    for (const v of volumes) {
      const isEditing = uiLocal.editingVolIdx === v.index;
      html += `<details class="mneme-volume" ${isEditing ? 'open' : ''}>
        <summary class="mneme-volume-summary">
          <span>第 ${v.index} 卷 · 《${esc(v.title)}》${v.timeRange ? `（${esc(v.timeRange)}）` : ''}</span>
          <div class="mneme-entry-actions">
            <button class="mneme-link" type="button" data-action="edit-vol" data-idx="${v.index}">编辑</button>
            <button class="mneme-link danger" type="button" data-action="del-vol" data-idx="${v.index}">删除</button>
          </div>
        </summary>
        ${
          isEditing
            ? `<div class="mneme-card" style="margin-top:8px">
                <div class="mneme-row">
                  <input id="suiji-edit-vol-title" class="mneme-input" value="${esc(v.title)}" />
                  <input id="suiji-edit-vol-range" class="mneme-input" value="${esc(v.timeRange || '')}" />
                </div>
                <textarea id="suiji-edit-vol-recap" class="mneme-textarea" rows="4">${esc(v.recap)}</textarea>
                <div class="mneme-row">
                  <button class="mneme-btn mneme-btn-sm" type="button" data-action="save-vol" data-idx="${v.index}">保存</button>
                  <button class="mneme-btn mneme-btn-sm" type="button" data-action="cancel-vol">取消</button>
                </div>
              </div>`
            : `<p class="mneme-entry-body" style="margin-top:6px">${esc(formatVolumeRecap(v.timeRange, v.recap))}</p>`
        }
      </details>`;
    }
  }

  // 三、典籍总卷
  const epochs = [...(s.epochs ?? [])].reverse();
  html += `<div class="mneme-row" style="justify-content:space-between;margin-top:8px">
    <div class="mneme-section-title" style="margin-top:0">三、典籍总卷（多卷合并） · ${epochs.length}</div>
    <button class="mneme-btn mneme-btn-sm" type="button" data-action="toggle-epoch-form">${uiLocal.showEpochForm ? '收起' : '+ 新增总卷'}</button>
  </div>`;

  if (uiLocal.showEpochForm) {
    html += `<div class="mneme-card">
      <div class="mneme-row">
        <input id="suiji-new-ep-title" class="mneme-input" placeholder="总卷名称" />
        <input id="suiji-new-ep-range" class="mneme-input" placeholder="起止年月日" />
      </div>
      <textarea id="suiji-new-ep-recap" class="mneme-textarea" rows="3" placeholder="【xx年xx月xx日-xx年xx月xx日】阶段主线总结…"></textarea>
      <div class="mneme-row"><button class="mneme-btn mneme-btn-sm" type="button" data-action="add-epoch">保存新总卷</button></div>
    </div>`;
  }

  if (epochs.length === 0) {
    html += `<div class="mneme-empty">暂无典籍总卷（已封卷宗满 ${settingsStore.epochSize ?? 10} 卷时自动合并，也可手动合并）。</div>`;
  } else {
    for (const ep of epochs) {
      html += `<details class="mneme-volume">
        <summary class="mneme-volume-summary">
          <span>第 ${ep.index} 部总卷 · 《${esc(ep.title)}》${ep.timeRange ? `（${esc(ep.timeRange)}）` : ''}</span>
          <div class="mneme-entry-actions">
            <button class="mneme-link danger" type="button" data-action="del-epoch" data-idx="${ep.index}">删除</button>
          </div>
        </summary>
        <p class="mneme-entry-body" style="margin-top:6px">${esc(formatVolumeRecap(ep.timeRange, ep.recap))}</p>
      </details>`;
    }
  }

  html += `</div>`;
  return html;
}

function renderBondsTab() {
  const s = store.state;
  let html = `<div class="mneme-tab-body">
    <div class="mneme-row" style="justify-content:space-between">
      <label class="mneme-inline-toggle">
        <input type="checkbox" data-action="toggle-mod" data-mod="enableBonds" ${settingsStore.enableBonds !== false ? 'checked' : ''} />
        <span>启用羁绊注入与读取</span>
      </label>
      <button class="mneme-btn mneme-btn-sm" type="button" data-action="toggle-bond-form">${uiLocal.showBondForm ? '收起' : '+ 新增角色'}</button>
    </div>`;

  if (uiLocal.showBondForm) {
    html += `<div class="mneme-card">
      <div class="mneme-row">
        <input id="suiji-new-bond-name" class="mneme-input" placeholder="角色名（必填）" />
        <input id="suiji-new-bond-score" class="mneme-input" type="number" step="0.1" value="0" placeholder="初始好感" />
      </div>
      <input id="suiji-new-bond-rel" class="mneme-input" placeholder="当前关系（如：朋友 / 恋人 / 宿敌，选填）" />
      <textarea id="suiji-new-bond-imp" class="mneme-textarea" rows="2" placeholder="对 user 的印象（选填）"></textarea>
      <div class="mneme-row"><button class="mneme-btn mneme-btn-sm" type="button" data-action="add-bond">添加角色</button></div>
    </div>`;
  }

  if (!s) return html + `<div class="mneme-empty">当前没有打开的聊天。</div></div>`;
  const list = Object.values(s.bonds);
  if (list.length === 0) {
    return html + `<div class="mneme-empty">暂无羁绊记录。</div></div>`;
  }

  for (const bond of list) {
    const score = bondScore(bond);
    const rel = bondRelation(bond);
    const imp = bond.impressionOverride ?? bond.impression;
    const isEditing = uiLocal.editingBondName === bond.name;
    html += `<div class="mneme-bond">
      <div class="mneme-bond-line">
        <strong class="mneme-bond-name">${esc(bond.name)}</strong>
        ${rel ? `<span class="mneme-chip mneme-bond-tier">${esc(rel)}</span>` : ''}
        <span class="mneme-score-unit">好感 <strong>${score}</strong></span>
        <div class="mneme-entry-actions">
          <button class="mneme-link" type="button" data-action="edit-bond" data-name="${esc(bond.name)}">${isEditing ? '收起' : '编辑'}</button>
          <button class="mneme-link danger" type="button" data-action="del-bond" data-name="${esc(bond.name)}">删除</button>
        </div>
      </div>
      <div class="mneme-bond-block">
        <span class="mneme-bond-label">对 user 的印象：</span>
        <p class="mneme-entry-body">${esc(imp || '暂无印象记录')}</p>
      </div>
      ${
        isEditing
          ? `<div class="mneme-card">
              <div class="mneme-row">
                <input id="suiji-edit-bond-score" class="mneme-input" type="number" step="0.1" value="${score}" />
                <input id="suiji-edit-bond-rel" class="mneme-input" value="${esc(rel)}" placeholder="关系描述" />
              </div>
              <textarea id="suiji-edit-bond-imp" class="mneme-textarea" rows="2" placeholder="对 user 的印象">${esc(imp)}</textarea>
              <div class="mneme-row">
                <button class="mneme-btn mneme-btn-sm" type="button" data-action="save-bond" data-name="${esc(bond.name)}">保存修改</button>
              </div>
            </div>`
          : ''
      }
      <details class="mneme-bond-events">
        <summary>重大好感事件（${(bond.events ?? []).length}）</summary>
        ${
          (bond.events ?? []).length === 0
            ? `<p class="mneme-muted" style="margin-top:4px">暂无重大好感事件</p>`
            : (bond.events ?? [])
                .map(
                  (ev) =>
                    `<p class="mneme-muted" style="margin-top:4px"><strong>${ev.delta >= 0 ? '+' : ''}${ev.delta}</strong> · ${esc(ev.text)}</p>`,
                )
                .join('')
        }
      </details>
    </div>`;
  }
  html += `</div>`;
  return html;
}

function renderItemsTab() {
  const s = store.state;
  let html = `<div class="mneme-tab-body">
    <div class="mneme-row" style="justify-content:space-between">
      <label class="mneme-inline-toggle">
        <input type="checkbox" data-action="toggle-mod" data-mod="enableItems" ${settingsStore.enableItems !== false ? 'checked' : ''} />
        <span>启用道具注入与读取</span>
      </label>
      <button class="mneme-btn mneme-btn-sm" type="button" data-action="toggle-item-form">${uiLocal.showItemForm ? '收起' : '+ 新增道具'}</button>
    </div>`;

  if (uiLocal.showItemForm) {
    html += `<div class="mneme-card">
      <div class="mneme-row">
        <input id="suiji-new-item-name" class="mneme-input" placeholder="物品名称" />
        <input id="suiji-new-item-cond" class="mneme-input" placeholder="当前状态（如：完好/已开启）" />
      </div>
      <div class="mneme-row">
        <select id="suiji-new-item-status" class="mneme-input">
          <option value="held">持有中</option>
          <option value="gifted">已赠出（送给他人）</option>
          <option value="lost">已遗失</option>
          <option value="consumed">已消耗</option>
        </select>
        <input id="suiji-new-item-holder" class="mneme-input" placeholder="持有者" />
      </div>
      <input id="suiji-new-item-src" class="mneme-input" placeholder="来源或赠送去向" />
      <textarea id="suiji-new-item-desc" class="mneme-textarea" rows="2" placeholder="物品外观、来历与具体作用详情"></textarea>
      <div class="mneme-row"><button class="mneme-btn mneme-btn-sm" type="button" data-action="add-item">保存道具</button></div>
    </div>`;
  }

  if (!s) return html + `<div class="mneme-empty">当前没有打开的聊天。</div></div>`;
  if ((s.items ?? []).length === 0) return html + `<div class="mneme-empty">暂无道具记录。</div></div>`;

  for (const item of s.items) {
    html += `<div class="mneme-card">
      <div class="mneme-entry-head">
        <strong>${esc(item.name)}</strong>
        <span class="mneme-chip">${statusLabel(item.status)}</span>
        ${item.condition ? `<span class="mneme-chip">状态：${esc(item.condition)}</span>` : ''}
        ${item.holder ? `<span class="mneme-muted">持有者：${esc(item.holder)}</span>` : ''}
        <button class="mneme-link danger" type="button" data-action="del-item" data-id="${esc(item.id)}">删除</button>
      </div>
      <p class="mneme-muted">来源/去向：${esc(item.source || '未知')}</p>
      <p class="mneme-entry-body">${esc(item.effect || '暂无详细描述')}</p>
    </div>`;
  }
  html += `</div>`;
  return html;
}

function renderEventsTab() {
  const s = store.state;
  let html = `<div class="mneme-tab-body">
    <div class="mneme-row" style="justify-content:space-between">
      <label class="mneme-inline-toggle">
        <input type="checkbox" data-action="toggle-mod" data-mod="enableEvents" ${settingsStore.enableEvents !== false ? 'checked' : ''} />
        <span>启用重要事件注入与读取（永久保留）</span>
      </label>
      <button class="mneme-btn mneme-btn-sm" type="button" data-action="toggle-event-form">${uiLocal.showEventForm ? '收起' : '+ 新增重要事件'}</button>
    </div>`;

  if (uiLocal.showEventForm) {
    html += `<div class="mneme-card">
      <div class="mneme-row">
        <select id="suiji-new-ev-cat" class="mneme-input">
          <option value="约定">约定</option>
          <option value="誓言">誓言</option>
          <option value="束缚">束缚</option>
          <option value="重大事件">重大事件</option>
        </select>
        <input id="suiji-new-ev-title" class="mneme-input" placeholder="事件标题" />
      </div>
      <textarea id="suiji-new-ev-content" class="mneme-textarea" rows="3" placeholder="具体约定条款、誓言内容或重大事件前因后果"></textarea>
      <div class="mneme-row"><button class="mneme-btn mneme-btn-sm" type="button" data-action="add-event">保存重要事件</button></div>
    </div>`;
  }

  if (!s) return html + `<div class="mneme-empty">当前没有打开的聊天。</div></div>`;
  const evs = s.importantEvents ?? [];
  if (evs.length === 0) return html + `<div class="mneme-empty">暂无重要事件或誓言约定。</div></div>`;

  for (const ev of evs) {
    html += `<div class="mneme-card">
      <div class="mneme-entry-head">
        <span class="mneme-chip mneme-imp-permanent">${esc(ev.category || '重大事件')}</span>
        <strong>${esc(ev.title)}</strong>
        <button class="mneme-link danger" type="button" data-action="del-event" data-id="${esc(ev.id)}">删除</button>
      </div>
      <p class="mneme-entry-body">${esc(ev.content)}</p>
    </div>`;
  }
  html += `</div>`;
  return html;
}

function renderSettingsPanel() {
  return `<div class="mneme-tab-body">
    <div class="mneme-section-title">核心与模块独立开关</div>
    <label class="mneme-field">
      <span>启用插件总开关</span>
      <input type="checkbox" data-action="toggle-mod" data-mod="enabled" ${settingsStore.enabled ? 'checked' : ''} />
    </label>
    <label class="mneme-field">
      <span>1. 记忆与卷宗（summary / seal）</span>
      <input type="checkbox" data-action="toggle-mod" data-mod="enableMemory" ${settingsStore.enableMemory !== false ? 'checked' : ''} />
    </label>
    <label class="mneme-field">
      <span>2. 羁绊与好感（bonds）</span>
      <input type="checkbox" data-action="toggle-mod" data-mod="enableBonds" ${settingsStore.enableBonds !== false ? 'checked' : ''} />
    </label>
    <label class="mneme-field">
      <span>3. 道具与礼物（items）</span>
      <input type="checkbox" data-action="toggle-mod" data-mod="enableItems" ${settingsStore.enableItems !== false ? 'checked' : ''} />
    </label>
    <label class="mneme-field">
      <span>4. 重要事件与誓言（events）</span>
      <input type="checkbox" data-action="toggle-mod" data-mod="enableEvents" ${settingsStore.enableEvents !== false ? 'checked' : ''} />
    </label>
    <label class="mneme-field">
      <span>每卷记忆条数（满条自动封卷）</span>
      <input class="mneme-input" type="number" min="5" max="30" data-action="set-num" data-key="volumeSize" value="${settingsStore.volumeSize}" />
    </label>
    <label class="mneme-field">
      <span>每部总卷包含卷宗数（满卷自动合并）</span>
      <input class="mneme-input" type="number" min="2" max="30" data-action="set-num" data-key="epochSize" value="${settingsStore.epochSize ?? 10}" />
    </label>
    <label class="mneme-field">
      <span>提示词注入预算上限（token）</span>
      <input class="mneme-input" type="number" min="200" step="100" data-action="set-num" data-key="tokenBudget" value="${settingsStore.tokenBudget}" />
    </label>
    <label class="mneme-field">
      <span>自动隐藏回复末尾的记忆块注释</span>
      <input type="checkbox" data-action="toggle-mod" data-mod="autoStripBlock" ${settingsStore.autoStripBlock !== false ? 'checked' : ''} />
    </label>
  </div>`;
}

function renderHelpPanel() {
  return `<div class="mneme-tab-body">
    <div class="mneme-section-title">使用说明</div>
    <h3 class="mneme-help-title">岁记 是什么</h3>
    <p class="mneme-entry-body">一个分聊天独立绑定的 SillyTavern 三级卷宗式记忆插件（<code>Suiji</code>）。每轮对话结束后，模型会在回复末尾附带 <code>&lt;!--SUIJI ... SUIJI--&gt;</code> 结构化记忆块，插件解析后将其收入账本，并在下次生成前通过 <code>setExtensionPrompt('suiji', text, 1, 1, false, 0)</code> 注入到聊天上下文中。</p>
  </div>`;
}

function mountVanillaApp(root) {
  const panelEl = document.createElement('div');
  const ballEl = document.createElement('button');
  const drawerEl = document.createElement('aside');
  root.append(panelEl, ballEl, drawerEl);

  renderApp = () => {
    const ui = settingsStore.ui;
    panelEl.className = `mneme-panel mneme-theme-${ui.theme}`;
    panelEl.style.display = panelState.visible ? 'flex' : 'none';
    panelEl.style.left = `${ui.x}px`;
    panelEl.style.top = `${ui.y}px`;
    panelEl.style.width = `${ui.width}px`;
    panelEl.style.height = `${ui.height}px`;
    panelEl.style.fontSize = `${ui.fontSize}px`;
    panelEl.style.setProperty('--mneme-accent', ui.accent);

    let bodyHtml = '';
    if (panelState.showHelp) bodyHtml = renderHelpPanel();
    else if (panelState.showSettings) bodyHtml = renderSettingsPanel();
    else if (panelState.activeTab === 'bonds') bodyHtml = renderBondsTab();
    else if (panelState.activeTab === 'items') bodyHtml = renderItemsTab();
    else if (panelState.activeTab === 'timeline') bodyHtml = renderEventsTab();
    else bodyHtml = renderMemoryTab();

    panelEl.innerHTML = `
      <header class="mneme-head" id="suiji-drag-head">
        <div class="mneme-brand">岁记</div>
        <div class="mneme-head-actions">
          <button class="mneme-icon-btn ${settingsStore.enabled ? 'mneme-icon-btn-on' : 'mneme-icon-btn-off'}" title="开关插件" data-action="toggle-enabled">⏻</button>
          ${
            panelState.showHelp || panelState.showSettings
              ? `<button class="mneme-icon-btn mneme-back-btn" title="返回" data-action="close-sub">←</button>`
              : `<button class="mneme-icon-btn" title="使用说明" data-action="open-help">?</button>
                 <button class="mneme-icon-btn ${ui.ballVisible && settingsStore.enabled ? 'mneme-icon-btn-on' : 'mneme-icon-btn-off'}" title="显示/隐藏悬浮球" data-action="toggle-ball">◍</button>
                 <button class="mneme-icon-btn" title="设置" data-action="open-settings">⚙</button>`
          }
          <button class="mneme-icon-btn" title="关闭" data-action="close-panel">×</button>
        </div>
      </header>
      <section class="mneme-body">${bodyHtml}</section>
      <footer class="mneme-tabs">
        <button class="mneme-tab ${panelState.activeTab === 'memory' ? 'active' : ''}" data-action="tab" data-tab="memory">记忆</button>
        <button class="mneme-tab ${panelState.activeTab === 'bonds' ? 'active' : ''}" data-action="tab" data-tab="bonds">羁绊</button>
        <button class="mneme-tab ${panelState.activeTab === 'items' ? 'active' : ''}" data-action="tab" data-tab="items">道具</button>
        <button class="mneme-tab ${panelState.activeTab === 'timeline' ? 'active' : ''}" data-action="tab" data-tab="timeline">重要事件</button>
      </footer>
      <div class="mneme-resize" id="suiji-resize-handle"></div>
    `;

    // 悬浮球
    ballEl.type = 'button';
    ballEl.className = `mneme-ball suiji-ball mneme-theme-${ui.theme}`;
    ballEl.style.display = settingsStore.enabled && ui.ballVisible ? 'flex' : 'none';
    const chatRect = document.getElementById('chat')?.getBoundingClientRect();
    const ballSize = ui.ballSize || 44;
    const bx = ui.ballX ?? (chatRect ? chatRect.right - ballSize / 2 : window.innerWidth - ballSize);
    const by = ui.ballY ?? window.innerHeight / 2;
    ballEl.style.left = `${bx}px`;
    ballEl.style.top = `${by}px`;
    ballEl.style.width = `${ballSize}px`;
    ballEl.style.height = `${ballSize}px`;
    ballEl.title = '打开 岁记 一览';
    ballEl.innerHTML = `<span class="mneme-ball-letter" style="color:${ui.ballColor || ui.accent};font-size:20px">${esc(ui.ballText || '岁')}</span>`;

    // 一览抽屉
    drawerEl.className = `mneme-drawer mneme-theme-${ui.theme}`;
    drawerEl.style.display = settingsStore.enabled && ui.ballVisible && panelState.overviewOpen ? 'flex' : 'none';
    if (panelState.overviewOpen) {
      const s = store.state;
      drawerEl.style.left = `${Math.max(12, bx - 328)}px`;
      drawerEl.style.top = `${Math.max(24, by - 160)}px`;
      drawerEl.style.width = '320px';
      drawerEl.innerHTML = `
        <header class="mneme-drawer-head">
          <span class="mneme-drawer-title">岁记 · 一览</span>
          <button class="mneme-icon-btn" data-action="close-drawer">×</button>
        </header>
        <div class="mneme-drawer-body">
          <p class="mneme-drawer-line">当前卷：${s ? s.entries.length : 0}/${settingsStore.volumeSize} 条 · 已封 ${s ? s.volumes.length : 0} 卷 · 总卷 ${s ? (s.epochs ?? []).length : 0} 部</p>
          <p class="mneme-drawer-line">羁绊角色：${s ? Object.keys(s.bonds).length : 0} 人 · 道具：${s ? s.items.length : 0} 件 · 重要事件：${s ? (s.importantEvents ?? []).length : 0} 项</p>
        </div>
      `;
    }
  };

  let ballDragged = false;
  ballEl.addEventListener('pointerdown', (ev) => {
    const startX = ev.clientX;
    const startY = ev.clientY;
    const rect = ballEl.getBoundingClientRect();
    ballDragged = false;
    const onMove = (me) => {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) ballDragged = true;
      if (!ballDragged) return;
      const nx = Math.max(4, Math.min(window.innerWidth - rect.width - 4, rect.left + dx));
      const ny = Math.max(4, Math.min(window.innerHeight - rect.height - 4, rect.top + dy));
      ballEl.style.left = `${nx}px`;
      ballEl.style.top = `${ny}px`;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (ballDragged) {
        const finalRect = ballEl.getBoundingClientRect();
        updateSettings({ ui: { ...settingsStore.ui, ballX: Math.round(finalRect.left), ballY: Math.round(finalRect.top) } });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  ballEl.addEventListener('click', () => {
    if (ballDragged) return;
    panelState.overviewOpen = !panelState.overviewOpen;
    renderApp();
  });

  panelEl.addEventListener('pointerdown', (ev) => {
    const head = ev.target.closest('#suiji-drag-head');
    const resize = ev.target.closest('#suiji-resize-handle');
    if (head && !ev.target.closest('button')) {
      const startX = ev.clientX - settingsStore.ui.x;
      const startY = ev.clientY - settingsStore.ui.y;
      const onMove = (me) => {
        const nx = Math.max(0, Math.min(window.innerWidth - 120, me.clientX - startX));
        const ny = Math.max(0, Math.min(window.innerHeight - 80, me.clientY - startY));
        panelEl.style.left = `${nx}px`;
        panelEl.style.top = `${ny}px`;
        settingsStore.ui.x = nx;
        settingsStore.ui.y = ny;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        updateSettings({ ui: { ...settingsStore.ui } });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    } else if (resize) {
      ev.preventDefault();
      const startX = ev.clientX;
      const startY = ev.clientY;
      const startW = settingsStore.ui.width;
      const startH = settingsStore.ui.height;
      const onMove = (me) => {
        const nw = Math.max(320, startW + (me.clientX - startX));
        const nh = Math.max(320, startH + (me.clientY - startY));
        panelEl.style.width = `${nw}px`;
        panelEl.style.height = `${nh}px`;
        settingsStore.ui.width = nw;
        settingsStore.ui.height = nh;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        updateSettings({ ui: { ...settingsStore.ui } });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
  });

  drawerEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action="close-drawer"]');
    if (btn) {
      panelState.overviewOpen = false;
      renderApp();
    }
  });

  panelEl.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const act = el.getAttribute('data-action');
    if (act === 'tab') {
      panelState.activeTab = el.getAttribute('data-tab') || 'memory';
      panelState.showHelp = false;
      panelState.showSettings = false;
      renderApp();
    } else if (act === 'toggle-enabled') {
      updateSettings({ enabled: !settingsStore.enabled });
      refreshInjection();
    } else if (act === 'open-help') {
      panelState.showHelp = true;
      panelState.showSettings = false;
      renderApp();
    } else if (act === 'open-settings') {
      panelState.showSettings = true;
      panelState.showHelp = false;
      renderApp();
    } else if (act === 'close-sub') {
      panelState.showHelp = false;
      panelState.showSettings = false;
      renderApp();
    } else if (act === 'close-panel') {
      panelState.visible = false;
      renderApp();
    } else if (act === 'toggle-ball') {
      updateSettings({ ui: { ...settingsStore.ui, ballVisible: !settingsStore.ui.ballVisible } });
    } else if (act === 'toggle-preview') {
      uiLocal.showFullPreview = !uiLocal.showFullPreview;
      renderApp();
    } else if (act === 'copy-preview') {
      navigator.clipboard?.writeText(getCurrentInjectionText());
    } else if (act === 'toggle-prompt') {
      uiLocal.showPrompt = !uiLocal.showPrompt;
      renderApp();
    } else if (act === 'save-prompts') {
      const sum = document.getElementById('suiji-prompt-summary')?.value ?? '';
      const seal = document.getElementById('suiji-prompt-seal')?.value ?? '';
      const ep = document.getElementById('suiji-prompt-epoch')?.value ?? '';
      updateSettings({ summaryPrompt: sum.trim(), sealPrompt: seal.trim(), epochPrompt: ep.trim() });
      refreshInjection();
      uiLocal.showPrompt = false;
      renderApp();
    } else if (act === 'reset-prompts') {
      updateSettings({ summaryPrompt: '', sealPrompt: '', epochPrompt: '' });
      refreshInjection();
      renderApp();
    } else if (act === 'toggle-mem-form') {
      uiLocal.showMemForm = !uiLocal.showMemForm;
      renderApp();
    } else if (act === 'add-mem') {
      const txt = document.getElementById('suiji-new-mem-text')?.value?.trim();
      const imp = document.getElementById('suiji-new-mem-imp')?.value || 'normal';
      if (!txt || !store.state) return;
      const next = cloneData(store.state);
      next.entries.push({
        id: `manual-${Date.now().toString(36)}`,
        messageId: -1,
        swipeId: 0,
        mesHash: '',
        at: Date.now(),
        storyTime: '',
        location: '',
        summary: txt,
        characters: [],
        result: '',
        importance: imp,
        volume: next.stats.sealedVolumes + 1,
        source: 'manual',
      });
      next.stats.totalEntries += 1;
      uiLocal.showMemForm = false;
      commitState(next);
      refreshInjection();
    } else if (act === 'edit-entry') {
      uiLocal.editingEntryId = el.getAttribute('data-id');
      renderApp();
    } else if (act === 'cancel-entry') {
      uiLocal.editingEntryId = null;
      renderApp();
    } else if (act === 'save-entry') {
      const id = el.getAttribute('data-id');
      const txt = document.getElementById('suiji-edit-entry-text')?.value?.trim();
      const imp = document.getElementById('suiji-edit-entry-imp')?.value || 'normal';
      if (!id || !txt || !store.state) return;
      const next = cloneData(store.state);
      const target = next.entries.find((e) => e.id === id);
      if (target) {
        target.summary = txt;
        target.storyTime = '';
        target.location = '';
        target.importance = imp;
      }
      uiLocal.editingEntryId = null;
      commitState(next);
      refreshInjection();
    } else if (act === 'del-entry') {
      const id = el.getAttribute('data-id');
      if (!id || !store.state) return;
      const next = removeEntryAndRollback(store.state, id);
      commitState(next);
      refreshInjection();
    } else if (act === 'manual-seal') {
      if (!store.state || store.state.entries.length === 0) return;
      const next = cloneData(store.state);
      const toSeal = next.entries.splice(0, next.entries.length);
      const volNum = next.stats.sealedVolumes + 1;
      next.volumes.push(sealVolume(next, volNum, toSeal));
      next.stats.sealedVolumes = volNum;
      commitState(next);
      refreshInjection();
    } else if (act === 'manual-epoch') {
      if (!store.state || store.state.volumes.length === 0) return;
      const next = cloneData(store.state);
      const toMerge = next.volumes.splice(0, next.volumes.length);
      const epNum = (next.stats.sealedEpochs ?? next.epochs.length) + 1;
      next.epochs.push(sealEpoch(epNum, toMerge));
      next.stats.sealedEpochs = epNum;
      commitState(next);
      refreshInjection();
    } else if (act === 'toggle-vol-form') {
      uiLocal.showVolForm = !uiLocal.showVolForm;
      renderApp();
    } else if (act === 'add-vol') {
      const title = document.getElementById('suiji-new-vol-title')?.value?.trim();
      const timeRange = document.getElementById('suiji-new-vol-range')?.value?.trim() || '';
      const recap = document.getElementById('suiji-new-vol-recap')?.value?.trim();
      if (!title || !recap || !store.state) return;
      const next = cloneData(store.state);
      const idx = next.stats.sealedVolumes + 1;
      next.volumes.push({
        index: idx,
        title,
        timeRange,
        recap: formatVolumeRecap(timeRange, recap),
        entries: [],
        sealedAt: Date.now(),
        auto: false,
      });
      next.stats.sealedVolumes = idx;
      uiLocal.showVolForm = false;
      commitState(next);
      refreshInjection();
    } else if (act === 'edit-vol') {
      uiLocal.editingVolIdx = Number(el.getAttribute('data-idx'));
      renderApp();
    } else if (act === 'cancel-vol') {
      uiLocal.editingVolIdx = null;
      renderApp();
    } else if (act === 'save-vol') {
      const idx = Number(el.getAttribute('data-idx'));
      const title = document.getElementById('suiji-edit-vol-title')?.value?.trim();
      const range = document.getElementById('suiji-edit-vol-range')?.value?.trim() || '';
      const recap = document.getElementById('suiji-edit-vol-recap')?.value?.trim() || '';
      if (!store.state) return;
      const next = cloneData(store.state);
      const v = next.volumes.find((x) => x.index === idx);
      if (v) {
        v.title = title || `第 ${idx} 卷`;
        v.timeRange = range;
        v.recap = formatVolumeRecap(range, recap);
      }
      uiLocal.editingVolIdx = null;
      commitState(next);
      refreshInjection();
    } else if (act === 'del-vol') {
      const idx = Number(el.getAttribute('data-idx'));
      if (!store.state) return;
      const next = cloneData(store.state);
      next.volumes = next.volumes.filter((x) => x.index !== idx);
      commitState(next);
      refreshInjection();
    } else if (act === 'toggle-epoch-form') {
      uiLocal.showEpochForm = !uiLocal.showEpochForm;
      renderApp();
    } else if (act === 'add-epoch') {
      const title = document.getElementById('suiji-new-ep-title')?.value?.trim();
      const range = document.getElementById('suiji-new-ep-range')?.value?.trim() || '';
      const recap = document.getElementById('suiji-new-ep-recap')?.value?.trim();
      if (!title || !recap || !store.state) return;
      const next = cloneData(store.state);
      const idx = (next.stats.sealedEpochs ?? next.epochs.length) + 1;
      next.epochs.push({
        index: idx,
        title,
        timeRange: range,
        recap: formatVolumeRecap(range, recap),
        volumes: [],
        sealedAt: Date.now(),
        auto: false,
      });
      next.stats.sealedEpochs = idx;
      uiLocal.showEpochForm = false;
      commitState(next);
      refreshInjection();
    } else if (act === 'del-epoch') {
      const idx = Number(el.getAttribute('data-idx'));
      if (!store.state) return;
      const next = cloneData(store.state);
      next.epochs = (next.epochs ?? []).filter((x) => x.index !== idx);
      commitState(next);
      refreshInjection();
    } else if (act === 'toggle-bond-form') {
      uiLocal.showBondForm = !uiLocal.showBondForm;
      renderApp();
    } else if (act === 'add-bond') {
      const name = document.getElementById('suiji-new-bond-name')?.value?.trim();
      const score = roundDecimal(Number(document.getElementById('suiji-new-bond-score')?.value) || 0, 1);
      const rel = document.getElementById('suiji-new-bond-rel')?.value?.trim() || '';
      const imp = document.getElementById('suiji-new-bond-imp')?.value?.trim() || '';
      if (!name || !store.state) return;
      const next = cloneData(store.state);
      next.bonds[name] = {
        name,
        initialScore: score,
        manualDelta: 0,
        relation: rel,
        impression: imp,
        events: [],
        updatedAt: Date.now(),
      };
      uiLocal.showBondForm = false;
      commitState(next);
      refreshInjection();
    } else if (act === 'edit-bond') {
      const name = el.getAttribute('data-name');
      uiLocal.editingBondName = uiLocal.editingBondName === name ? null : name;
      renderApp();
    } else if (act === 'save-bond') {
      const name = el.getAttribute('data-name');
      if (!name || !store.state || !store.state.bonds[name]) return;
      const targetScore = roundDecimal(Number(document.getElementById('suiji-edit-bond-score')?.value) || 0, 1);
      const rel = document.getElementById('suiji-edit-bond-rel')?.value?.trim() || '';
      const imp = document.getElementById('suiji-edit-bond-imp')?.value?.trim() || '';
      const next = cloneData(store.state);
      const b = next.bonds[name];
      const evSum = (b.events ?? []).reduce((s, e) => s + (Number(e.delta) || 0), 0);
      b.manualDelta = roundDecimal(targetScore - b.initialScore - evSum, 1);
      b.relation = rel;
      b.impression = imp;
      b.impressionOverride = imp;
      uiLocal.editingBondName = null;
      commitState(next);
      refreshInjection();
    } else if (act === 'del-bond') {
      const name = el.getAttribute('data-name');
      if (!name || !store.state) return;
      const next = cloneData(store.state);
      delete next.bonds[name];
      commitState(next);
      refreshInjection();
    } else if (act === 'toggle-item-form') {
      uiLocal.showItemForm = !uiLocal.showItemForm;
      renderApp();
    } else if (act === 'add-item') {
      const name = document.getElementById('suiji-new-item-name')?.value?.trim();
      const cond = document.getElementById('suiji-new-item-cond')?.value?.trim() || '完好';
      const status = document.getElementById('suiji-new-item-status')?.value || 'held';
      const holder = document.getElementById('suiji-new-item-holder')?.value?.trim() || '';
      const src = document.getElementById('suiji-new-item-src')?.value?.trim() || '';
      const desc = document.getElementById('suiji-new-item-desc')?.value?.trim() || '';
      if (!name || !store.state) return;
      const next = cloneData(store.state);
      next.items.push({
        id: `item-${Date.now().toString(36)}`,
        name,
        condition: cond,
        status,
        holder,
        source: src,
        effect: desc,
        acquiredAt: Date.now(),
        entryId: null,
        messageId: null,
      });
      uiLocal.showItemForm = false;
      commitState(next);
      refreshInjection();
    } else if (act === 'del-item') {
      const id = el.getAttribute('data-id');
      if (!id || !store.state) return;
      const next = cloneData(store.state);
      next.items = next.items.filter((x) => x.id !== id);
      commitState(next);
      refreshInjection();
    } else if (act === 'toggle-event-form') {
      uiLocal.showEventForm = !uiLocal.showEventForm;
      renderApp();
    } else if (act === 'add-event') {
      const cat = document.getElementById('suiji-new-ev-cat')?.value || '重大事件';
      const title = document.getElementById('suiji-new-ev-title')?.value?.trim();
      const content = document.getElementById('suiji-new-ev-content')?.value?.trim();
      if ((!title && !content) || !store.state) return;
      const next = cloneData(store.state);
      next.importantEvents.push({
        id: `ev-${Date.now().toString(36)}`,
        category: cat,
        title: title || content.slice(0, 18),
        content: content || title,
        characters: [],
        at: Date.now(),
        entryId: null,
        messageId: null,
      });
      uiLocal.showEventForm = false;
      commitState(next);
      refreshInjection();
    } else if (act === 'del-event') {
      const id = el.getAttribute('data-id');
      if (!id || !store.state) return;
      const next = cloneData(store.state);
      next.importantEvents = (next.importantEvents ?? []).filter((x) => x.id !== id);
      commitState(next);
      refreshInjection();
    }
  });

  panelEl.addEventListener('change', (ev) => {
    const el = ev.target;
    const act = el.getAttribute('data-action');
    if (act === 'toggle-mod') {
      const mod = el.getAttribute('data-mod');
      if (mod) {
        updateSettings({ [mod]: el.checked });
        refreshInjection();
      }
    } else if (act === 'set-num') {
      const key = el.getAttribute('data-key');
      if (key) {
        updateSettings({ [key]: Number(el.value) || 10 });
        refreshInjection();
      }
    }
  });
}

function boot() {
  reloadSettings();

  if (!document.getElementById('suiji-root')) {
    const root = document.createElement('div');
    root.id = 'suiji-root';
    document.body.appendChild(root);
    mountVanillaApp(root);
  }

  ensureWandButton(() => {
    setWandDot(false);
    panelState.visible = !panelState.visible;
    renderApp();
  });
  initHost();
  renderApp();
  console.info('[岁记] booted');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
