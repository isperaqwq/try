import type {
  Delta,
  DeltaBond,
  DeltaImportantEvent,
  DeltaItem,
  Importance,
} from './types.ts';
import { roundDecimal } from './bonds.ts';

const BLOCK_RE = /<!--\s*MNEME([\s\S]*?)MNEME\s*-->/i;
const FENCE_RE = /```(?:mneme|json)\s*([\s\S]*?)```/i;

export interface ParseResult {
  ok: boolean;
  delta?: Delta;
  block?: string;
  inner?: string;
  reason?: string;
}

export function parseDelta(text: string): ParseResult {
  if (!text || typeof text !== 'string') {
    return { ok: false, reason: 'empty' };
  }

  let inner: string | undefined;
  let block: string | undefined;

  const blockMatch = text.match(BLOCK_RE);
  if (blockMatch) {
    block = blockMatch[0];
    inner = blockMatch[1];
  } else {
    const fenceMatch = text.match(FENCE_RE);
    if (
      fenceMatch &&
      /"(?:summary|memory|bonds|items|events|importantEvents|seal)"\s*:/.test(fenceMatch[1])
    ) {
      block = fenceMatch[0];
      inner = fenceMatch[1];
    }
  }

  if (!inner) {
    return { ok: false, reason: 'no-block' };
  }

  const jsonText = extractObject(cleanJson(inner));
  if (!jsonText) {
    return { ok: false, reason: 'no-json', block, inner };
  }

  try {
    const raw = JSON.parse(jsonText);
    const delta = normalizeDelta(raw);
    return delta
      ? { ok: true, delta, block, inner }
      : { ok: false, reason: 'invalid', block, inner };
  } catch {
    return { ok: false, reason: 'bad-json', block, inner };
  }
}

function extractObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

function cleanJson(text: string): string {
  let out = text.replace(/^\uFEFF/, '').trim();
  out = out.replace(/```(?:json|mneme)?/gi, '');
  out = out.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  out = out.replace(/,\s*([}\]])/g, '$1');
  return out;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBondItem(raw: any): DeltaBond | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = asString(raw.name ?? raw.角色 ?? raw.character);
  if (!name) return null;

  const deltaNum = Number(raw.delta ?? raw.change ?? raw.变动 ?? 0);
  const delta = Number.isFinite(deltaNum) ? roundDecimal(deltaNum, 1) : 0;

  const scoreRaw = raw.score ?? raw.好感 ?? raw.好感度;
  const scoreNum = scoreRaw !== undefined && scoreRaw !== null ? Number(scoreRaw) : undefined;
  const score =
    scoreNum !== undefined && Number.isFinite(scoreNum) ? roundDecimal(scoreNum, 1) : undefined;

  const relation = asString(raw.relation ?? raw.relationship ?? raw.关系);
  const impression = asString(raw.impression ?? raw.印象);
  const majorEvent = asString(raw.majorEvent ?? raw.major_event ?? raw.重大事件);
  const legacyEvent = asString(raw.event ?? raw.事件);

  return {
    name,
    delta,
    score,
    relation: relation || undefined,
    impression: impression || undefined,
    majorEvent: majorEvent || undefined,
    event: majorEvent || legacyEvent || undefined,
    importance: ['normal', 'major', 'permanent'].includes(raw.importance)
      ? raw.importance
      : undefined,
  };
}

function normalizeItem(raw: any): DeltaItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = asString(raw.name ?? raw.物品 ?? raw.item);
  if (!name) return null;

  const rawAction = asString(raw.action ?? raw.status ?? 'gain').toLowerCase();
  let action: DeltaItem['action'] = 'gain';
  if (
    rawAction === 'give' ||
    rawAction === 'gifted' ||
    rawAction === '赠送' ||
    rawAction === '赠出' ||
    rawAction === '送出'
  ) {
    action = 'give';
  } else if (rawAction === 'lose' || rawAction === 'lost' || rawAction === '遗失') {
    action = 'lose';
  } else if (rawAction === 'consume' || rawAction === 'consumed' || rawAction === '消耗') {
    action = 'consume';
  } else if (
    rawAction === 'change' ||
    rawAction === 'update' ||
    rawAction === '更新' ||
    rawAction === '状态更新'
  ) {
    action = 'change';
  }

  const description = asString(
    raw.desc ?? raw.description ?? raw.detail ?? raw.effect ?? raw.详情 ?? raw.作用,
  );
  const holder = asString(raw.holder ?? raw.owner ?? raw.持有者);
  const condition = asString(
    raw.state ?? raw.condition ?? raw.itemState ?? raw.当前状态 ?? raw.状态描述,
  );
  const source = asString(raw.source ?? raw.from ?? raw.来源 ?? raw.去向);

  return {
    action,
    name,
    holder: holder || undefined,
    condition: condition || undefined,
    source: source || undefined,
    effect: description || undefined,
    description: description || undefined,
    note: asString(raw.note) || undefined,
  };
}

function normalizeImportantEvent(raw: any): DeltaImportantEvent | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const clean = raw.trim();
    if (!clean) return null;
    return {
      title: clean.slice(0, 18),
      category: '重大事件',
      content: clean,
      characters: [],
    };
  }
  if (typeof raw !== 'object') return null;
  const title = asString(raw.title ?? raw.name ?? raw.标题);
  const content = asString(raw.content ?? raw.summary ?? raw.description ?? raw.内容 ?? raw.描述);
  if (!title && !content) return null;
  const category = asString(raw.category ?? raw.type ?? raw.分类 ?? raw.类型) || '重大事件';
  const characters = Array.isArray(raw.characters ?? raw.participants)
    ? (raw.characters ?? raw.participants)
        .filter((x: unknown) => typeof x === 'string')
        .map((s: string) => s.trim())
        .filter(Boolean)
    : [];
  return {
    title: title || content.slice(0, 18),
    category,
    content: content || title,
    characters,
  };
}

function extractInlineImportance(text: string, fallback: Importance): { summary: string; importance: Importance } {
  let clean = text.trim();
  let importance = fallback;
  const tagMatch = clean.match(/^(?:\[|【)(普通|重要|永久|normal|major|permanent)(?:\]|】)\s*/i);
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    if (tag === '重要' || tag === 'major') importance = 'major';
    else if (tag === '永久' || tag === 'permanent') importance = 'permanent';
    else importance = 'normal';
    clean = clean.slice(tagMatch[0].length).trim();
  }
  return { summary: clean, importance };
}

function normalizeDelta(raw: unknown): Delta | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, any>;

  let rawMemory = '';
  let memImportance: Importance | undefined;
  if (typeof obj.memory === 'object' && obj.memory !== null) {
    rawMemory = asString(obj.memory.summary ?? obj.memory.text ?? obj.memory.content);
    if (['normal', 'major', 'permanent'].includes(obj.memory.importance)) {
      memImportance = obj.memory.importance;
    }
  } else {
    rawMemory = asString(obj.memory ?? obj.summary ?? obj.记忆 ?? obj.摘要);
  }

  const storyTime = asString(obj.storyTime ?? obj.time ?? obj.时间);
  const location = asString(obj.location ?? obj.place ?? obj.地点);

  const baseImportance: Importance = memImportance
    ? memImportance
    : ['normal', 'major', 'permanent'].includes(obj.importance)
      ? obj.importance
      : 'normal';

  const extracted = extractInlineImportance(rawMemory, baseImportance);
  let summary = extracted.summary;
  const importance = extracted.importance;

  if (summary && (storyTime || location) && !summary.startsWith('【')) {
    const prefix = [storyTime, location].filter(Boolean).join('·');
    if (prefix && !summary.includes(prefix)) {
      summary = `【${prefix}】${summary}`;
    }
  }

  const bondsRaw = Array.isArray(obj.bonds ?? obj.羁绊) ? (obj.bonds ?? obj.羁绊) : [];
  const itemsRaw = Array.isArray(obj.items ?? obj.道具) ? (obj.items ?? obj.道具) : [];
  const eventsRaw = Array.isArray(obj.events ?? obj.importantEvents ?? obj.重要事件)
    ? (obj.events ?? obj.importantEvents ?? obj.重要事件)
    : [];

  const bonds = bondsRaw.map(normalizeBondItem).filter(Boolean) as DeltaBond[];
  const items = itemsRaw.map(normalizeItem).filter(Boolean) as DeltaItem[];
  const events = eventsRaw.map(normalizeImportantEvent).filter(Boolean) as DeltaImportantEvent[];
  const seal = obj.seal && typeof obj.seal === 'object' ? obj.seal : undefined;
  const epochRaw = obj.epoch ?? obj.compendium ?? obj.总卷;
  const epoch = epochRaw && typeof epochRaw === 'object' ? epochRaw : undefined;
  const plot = obj.plot && typeof obj.plot === 'object' ? obj.plot : undefined;

  // 各个模块解耦：只要 memory / bonds / items / events / seal / epoch 中任意一个有有效内容即可解析成功
  if (!summary && bonds.length === 0 && items.length === 0 && events.length === 0 && !seal && !epoch && !plot) {
    return null;
  }

  return {
    summary,
    storyTime: '',
    location: '',
    characters: Array.isArray(obj.characters)
      ? obj.characters.filter((x: unknown) => typeof x === 'string').slice(0, 12)
      : [],
    result: asString(obj.result),
    importance,
    anchor: asString(obj.anchor) || undefined,
    bonds,
    items,
    events,
    plot,
    seal,
    epoch,
  };
}
