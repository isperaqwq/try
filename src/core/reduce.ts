import type {
  Bond,
  Delta,
  DeltaSeal,
  EpochVolume,
  MemoryEntry,
  MnemeState,
  TurnSnapshot,
  Volume,
} from './types.ts';
import { applyPlot } from './timeline.ts';
import { removeEntryLinks } from './reconcile.ts';
import { clamp, roundDecimal } from './bonds.ts';
import { formatEntryUnified, sealEpoch, sealVolume } from './seal.ts';
import { cloneData } from './clone.ts';

export interface DeltaMeta {
  messageId: number;
  swipeId: number;
  mesHash: string;
  now?: number;
  volumeSize?: number;
  epochSize?: number;
  enableMemory?: boolean;
  enableBonds?: boolean;
  enableItems?: boolean;
  enableEvents?: boolean;
}

export interface ApplyResult {
  state: MnemeState;
  entry: MemoryEntry;
  sealed: Volume | null;
  sealedEpoch?: EpochVolume | null;
  warnings: string[];
}

function ensureBond(
  state: MnemeState,
  name: string,
  now: number,
  entryId: string,
  messageId: number,
): Bond {
  if (!state.bonds[name]) {
    state.bonds[name] = {
      name,
      initialScore: 0,
      manualDelta: 0,
      relation: '',
      impression: '',
      events: [],
      updatedAt: now,
      entryId,
      messageId,
    };
  }
  return state.bonds[name];
}

function cleanSummary(summary: string): string {
  const lines = String(summary ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const filtered = lines.filter((line) => !/^(涉及|锚点)[：:]/.test(line));
  return (filtered.length > 0 ? filtered : lines).join('\n').trim();
}

export function applyDelta(state: MnemeState, delta: Delta, meta: DeltaMeta): ApplyResult {
  const now = meta.now ?? Date.now();
  const next = cloneData(state);
  if (!Array.isArray(next.importantEvents)) next.importantEvents = [];
  const warnings: string[] = [];

  const allowMemory = meta.enableMemory !== false;
  const allowBonds = meta.enableBonds !== false;
  const allowItems = meta.enableItems !== false;
  const allowEvents = meta.enableEvents !== false;

  // 用「消息索引」定位旧条目（支持同楼层重说/切换 swipe 时先回退该楼层的旧状态）
  const previous = next.entries.find((entry) => entry.messageId === meta.messageId);
  const entryId = previous?.id ?? `m${meta.messageId}-s${meta.swipeId}-${now.toString(36)}`;

  let prevSnapshot: TurnSnapshot;
  if (previous?.prevSnapshot) {
    next.bonds = cloneData(previous.prevSnapshot.bonds);
    next.items = cloneData(previous.prevSnapshot.items);
    next.importantEvents = cloneData(previous.prevSnapshot.importantEvents ?? []);
    prevSnapshot = cloneData(previous.prevSnapshot);
  } else {
    if (previous) {
      removeEntryLinks(next, [previous.id]);
    }
    prevSnapshot = {
      bonds: cloneData(next.bonds),
      items: cloneData(next.items),
      importantEvents: cloneData(next.importantEvents),
    };
  }

  next.entries = next.entries.filter((entry) => entry.id !== entryId && entry.messageId !== meta.messageId);

  const importance = delta.importance ?? 'normal';
  const simpleEntry = importance === 'normal';
  const cleanedSummary = cleanSummary(delta.summary);

  const unifiedSummary = cleanedSummary
    ? formatEntryUnified({
        summary: cleanedSummary,
        storyTime: delta.storyTime ?? '',
        location: delta.location ?? '',
      })
    : '';

  const entry: MemoryEntry = {
    id: entryId,
    messageId: meta.messageId,
    swipeId: meta.swipeId,
    mesHash: meta.mesHash,
    at: now,
    storyTime: delta.storyTime ?? '',
    location: delta.location ?? '',
    summary: unifiedSummary || '（本轮仅更新羁绊/道具/事件）',
    characters: simpleEntry ? [] : (delta.characters ?? []),
    result: delta.result ?? '',
    importance,
    anchor: simpleEntry ? undefined : delta.anchor,
    volume: next.stats.sealedVolumes + 1,
    source: 'model',
    prevSnapshot,
  };

  if (allowMemory && unifiedSummary) {
    next.entries.push(entry);
    if (!previous) {
      next.stats.totalEntries += 1;
    }
  }

  if (allowBonds) {
    for (const item of delta.bonds ?? []) {
      const name = (item.name ?? '').trim();
      if (!name) {
        warnings.push('bonds 缺少 name，已跳过');
        continue;
      }
      const bond = ensureBond(next, name, now, entryId, meta.messageId);
      const deltaValue = roundDecimal(Number(item.delta) || 0, 1);
      const eventText = (item.majorEvent ?? item.event ?? '').trim();

      if (eventText) {
        bond.events.push({
          id: `e${now.toString(36)}-${bond.events.length}`,
          text: eventText.slice(0, 240),
          delta: deltaValue,
          importance: item.importance ?? entry.importance,
          at: now,
          entryId,
          messageId: meta.messageId,
          major: true,
        });
        bond.updatedAt = now;
      } else if (deltaValue !== 0) {
        // 日常好感小幅波动只累计好感度数值，不在重大事件列表里刷屏
        bond.manualDelta = roundDecimal((Number(bond.manualDelta) || 0) + deltaValue, 1);
        bond.updatedAt = now;
      }

      if (item.relation !== undefined && item.relation.trim()) {
        bond.relation = item.relation.trim().slice(0, 60);
        bond.updatedAt = now;
      }

      if (item.impression !== undefined && item.impression.trim()) {
        bond.impression = item.impression.trim().slice(0, 400);
        bond.updatedAt = now;
      }
    }
  }

  if (allowItems) {
    for (const item of delta.items ?? []) {
      const name = (item.name ?? '').trim();
      if (!name) {
        warnings.push('items 缺少 name，已跳过');
        continue;
      }
      const existing = next.items.find((candidate) => candidate.name === name);
      const detail = (item.description ?? item.effect ?? '').trim();
      const cond = (item.condition ?? '').trim();

      if (item.action === 'gain') {
        if (existing) {
          existing.status = 'held';
          existing.holder = item.holder || existing.holder || 'user';
          if (cond) existing.condition = cond;
          existing.source = item.source || existing.source;
          existing.effect = detail || existing.effect;
          existing.entryId = entryId;
          existing.messageId = meta.messageId;
        } else {
          next.items.push({
            id: `i${now.toString(36)}-${next.items.length}`,
            name,
            holder: item.holder || 'user',
            condition: cond || '完好',
            source: item.source ?? '未知',
            effect: detail,
            status: 'held',
            acquiredAt: now,
            entryId,
            messageId: meta.messageId,
            note: item.note,
          });
        }
        continue;
      }

      if (item.action === 'give') {
        if (existing) {
          existing.status = 'gifted';
          existing.holder = item.holder || existing.holder || '';
          if (cond) existing.condition = cond;
          existing.source = item.source || existing.source || 'user 赠出';
          existing.effect = detail || existing.effect;
          existing.entryId = entryId;
          existing.messageId = meta.messageId;
        } else {
          next.items.push({
            id: `i${now.toString(36)}-${next.items.length}`,
            name,
            holder: item.holder || '',
            condition: cond || '完好',
            source: item.source ?? 'user 赠出',
            effect: detail,
            status: 'gifted',
            acquiredAt: now,
            entryId,
            messageId: meta.messageId,
            note: item.note,
          });
        }
        continue;
      }

      if (!existing) {
        if (item.action === 'change' || item.action === 'update') {
          next.items.push({
            id: `i${now.toString(36)}-${next.items.length}`,
            name,
            holder: item.holder || 'user',
            condition: cond || '完好',
            source: item.source ?? '未知',
            effect: detail,
            status: 'held',
            acquiredAt: now,
            entryId,
            messageId: meta.messageId,
            note: item.note,
          });
        } else {
          warnings.push(`道具 ${name} 未找到，${item.action} 已忽略`);
        }
        continue;
      }

      if (item.action === 'lose') existing.status = 'lost';
      if (item.action === 'consume') existing.status = 'consumed';
      if (cond) existing.condition = cond;
      if (item.action === 'change' || item.action === 'update') {
        if (item.holder) existing.holder = item.holder;
        if (item.source) existing.source = item.source;
        existing.effect = detail || existing.effect;
        existing.note = item.note ?? existing.note;
      }
      existing.entryId = entryId;
      existing.messageId = meta.messageId;
    }
  }

  if (allowEvents) {
    for (const ev of delta.events ?? []) {
      const title = (ev.title ?? '').trim();
      const content = (ev.content ?? '').trim();
      if (!title && !content) continue;
      const existing = next.importantEvents.find((e) => e.title === title && title);
      if (existing) {
        existing.content = content || existing.content;
        existing.category = ev.category || existing.category;
        if (ev.characters?.length) existing.characters = ev.characters;
        existing.entryId = entryId;
        existing.messageId = meta.messageId;
        existing.at = now;
      } else {
        next.importantEvents.push({
          id: `ev-${now.toString(36)}-${next.importantEvents.length}`,
          title: title || content.slice(0, 18),
          category: ev.category || '重大事件',
          content: content || title,
          characters: ev.characters ?? [],
          at: now,
          entryId,
          messageId: meta.messageId,
        });
      }
    }
  }

  if (delta.plot && next.timeline) {
    applyPlot(next.timeline, delta.plot);
  }

  const size = clamp(Math.round(meta.volumeSize ?? 10), 5, 30);
  const epSize = clamp(Math.round(meta.epochSize ?? 10), 2, 30);
  let sealed: Volume | null = null;
  let sealedEpoch: EpochVolume | null = null;
  if (allowMemory && next.entries.length >= size) {
    sealed = sealVolume(next, delta.seal as DeltaSeal | undefined, size);
    if (next.volumes.length >= epSize) {
      sealedEpoch = sealEpoch(next, delta.epoch as DeltaSeal | undefined, epSize);
    }
  }

  return { state: next, entry, sealed, sealedEpoch, warnings };
}

export function removeEntry(state: MnemeState, entryId: string): MnemeState {
  const next = cloneData(state);
  const idx = next.entries.findIndex((entry) => entry.id === entryId);
  if (idx >= 0 && idx === next.entries.length - 1 && next.entries[idx].prevSnapshot) {
    const snap = next.entries[idx].prevSnapshot!;
    next.bonds = cloneData(snap.bonds);
    next.items = cloneData(snap.items);
    next.importantEvents = cloneData(snap.importantEvents ?? []);
  }
  next.entries = next.entries.filter((entry) => entry.id !== entryId);
  for (const volume of next.volumes) {
    volume.entries = volume.entries.filter((entry) => entry.id !== entryId);
  }
  for (const ep of next.epochs ?? []) {
    for (const volume of ep.volumes) {
      volume.entries = volume.entries.filter((entry) => entry.id !== entryId);
    }
  }
  removeEntryLinks(next, [entryId]);
  return next;
}
