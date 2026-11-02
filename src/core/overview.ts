import type { ItemStatus, MemoryEntry, MnemeSettings, MnemeState } from './types.ts';
import { bondRelation, bondScore } from './bonds.ts';
import { formatEntryUnified } from './seal.ts';

export interface OverviewRuntime {
  missing: number;
  raw: number;
  trimmedLast: number;
  trimmedAt: number;
}

export interface OverviewChatMessage {
  is_hidden?: boolean;
}

export interface OverviewInput {
  state: MnemeState | null;
  settings: MnemeSettings;
  runtime: OverviewRuntime;
  chat: Array<OverviewChatMessage>;
}

export interface OverviewModel {
  hasChat: boolean;
  memory: {
    entries: number;
    volumeSize: number;
    currentVolume: number;
    volumes: number;
    epochs?: number;
    totalEntries: number;
    last: { summary: string; at: number; storyTime: string; location: string } | null;
    missing: number;
    raw: number;
  };
  floors: {
    stripped: number;
    rawFloors: number;
    stale: number;
    recent: Array<{ messageId: number; summary: string; raw: boolean }>;
    trimmedLast: number;
    trimmedAt: number;
    keepRecentTurns: number;
    tavernHidden: number;
    tavernHiddenFloors: number[];
  };
  items: {
    counts: Record<string, number>;
    changed: Array<{
      id: string;
      name: string;
      holder?: string;
      condition?: string;
      status: ItemStatus;
      source: string;
      effect: string;
      at: number;
    }>;
  };
  bonds: {
    changed: Array<{
      name: string;
      score: number;
      relation: string;
      tier: string;
      impression: string;
      impressionOnly: boolean;
      events: Array<{ delta: number; text: string }>;
    }>;
  };
  importantEvents: {
    total: number;
    recent: Array<{
      id: string;
      title: string;
      category: string;
      content: string;
    }>;
  };
}

function collectEntries(state: MnemeState | null): MemoryEntry[] {
  if (!state) return [];
  const list: MemoryEntry[] = [...state.entries];
  for (const volume of state.volumes) list.push(...volume.entries);
  for (const epoch of state.epochs ?? []) {
    for (const volume of epoch.volumes) list.push(...volume.entries);
  }
  return list;
}

/** 最新一条真实对话楼层（messageId >= 0）；封卷后仍能从 volumes 里找到。 */
export function latestEntryOf(state: MnemeState | null): MemoryEntry | null {
  let latest: MemoryEntry | null = null;
  for (const entry of collectEntries(state)) {
    if (entry.messageId < 0) continue;
    if (
      !latest ||
      entry.at > latest.at ||
      (entry.at === latest.at && entry.messageId >= latest.messageId)
    ) {
      latest = entry;
    }
  }
  return latest;
}

function firstLine(text: string, max = 60): string {
  const line =
    String(text ?? '')
      .split('\n')
      .find((part) => part.trim()) ?? '';
  const clean = line.trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function buildOverview(input: OverviewInput): OverviewModel {
  const { state, settings, runtime, chat } = input;
  const entries = collectEntries(state);
  const latest = latestEntryOf(state);

  const floorMap = new Map<number, MemoryEntry>();
  for (const entry of entries) {
    if (entry.messageId < 0) continue;
    const previous = floorMap.get(entry.messageId);
    if (!previous || entry.at >= previous.at) floorMap.set(entry.messageId, entry);
  }

  const recent = [...floorMap.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, 3)
    .map((entry) => ({
      messageId: entry.messageId,
      summary: firstLine(formatEntryUnified(entry)),
      raw: entry.source === 'raw',
    }));

  const rawFloors = new Set(
    entries
      .filter((entry) => entry.source === 'raw' && entry.messageId >= 0)
      .map((entry) => entry.messageId),
  ).size;

  const stale = entries.filter((entry) => entry.stale === true).length;

  const hiddenFloors = Array.isArray(chat)
    ? chat
        .map((message, index) => (message?.is_hidden === true ? index + 1 : 0))
        .filter((floor) => floor > 0)
    : [];

  const counts: Record<string, number> = { held: 0, gifted: 0, lost: 0, consumed: 0 };
  for (const item of state?.items ?? []) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }

  const changedItems = (state?.items ?? [])
    .filter((item) => latest !== null && item.entryId === latest.id)
    .sort((a, b) => b.acquiredAt - a.acquiredAt)
    .map((item) => ({
      id: item.id,
      name: item.name,
      holder: item.holder,
      condition: item.condition,
      status: item.status,
      source: item.source,
      effect: item.effect,
      at: item.acquiredAt,
    }));

  const changedBonds = Object.values(state?.bonds ?? {})
    .map((bond) => {
      const events = latest ? bond.events.filter((event) => event.entryId === latest.id) : [];
      const impressionOnly = events.length === 0 && latest !== null && bond.updatedAt === latest.at;
      if (events.length === 0 && !impressionOnly) return null;
      const score = bondScore(bond);
      const relation = bondRelation(bond);
      return {
        name: bond.name,
        score,
        relation,
        tier: relation || '未设关系',
        impression: firstLine(bond.impressionOverride ?? bond.impression),
        impressionOnly,
        events: events
          .slice(-3)
          .reverse()
          .map((event) => ({ delta: event.delta, text: event.text })),
      };
    })
    .filter((bond): bond is NonNullable<typeof bond> => bond !== null)
    .sort((a, b) => b.score - a.score);

  const allImportant = state?.importantEvents ?? [];

  return {
    hasChat: state !== null,
    memory: {
      entries: state?.entries.length ?? 0,
      volumeSize: settings.volumeSize,
      currentVolume: (state?.stats.sealedVolumes ?? 0) + 1,
      volumes: state?.volumes.length ?? 0,
      epochs: state?.epochs?.length ?? 0,
      totalEntries: state?.stats.totalEntries ?? 0,
      last: latest
        ? {
            summary: firstLine(formatEntryUnified(latest)),
            at: latest.at,
            storyTime: latest.storyTime,
            location: latest.location,
          }
        : null,
      missing: runtime.missing,
      raw: runtime.raw,
    },
    floors: {
      stripped: floorMap.size,
      rawFloors,
      stale,
      recent,
      trimmedLast: runtime.trimmedLast,
      trimmedAt: runtime.trimmedAt,
      keepRecentTurns: settings.keepRecentTurns,
      tavernHidden: hiddenFloors.length,
      tavernHiddenFloors: hiddenFloors.slice(-3),
    },
    items: { counts, changed: changedItems },
    bonds: { changed: changedBonds },
    importantEvents: {
      total: allImportant.length,
      recent: allImportant.slice(-3).reverse().map((ev) => ({
        id: ev.id,
        title: ev.title,
        category: String(ev.category || '重大事件'),
        content: firstLine(ev.content, 80),
      })),
    },
  };
}
