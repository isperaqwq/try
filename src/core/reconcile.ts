import type { MnemeState } from './types.ts';
import { hashText } from './hash.ts';
import { stripDelta } from './strip.ts';
import { cloneData } from './clone.ts';

export interface ChatLike {
  mes: string;
  is_user?: boolean;
}

export interface ReconcileResult {
  state: MnemeState;
  dropped: string[];
  remapped: number;
}

export function removeEntryLinks(state: MnemeState, entryIds: string[]): void {
  const set = new Set(entryIds);
  for (const [name, bond] of Object.entries(state.bonds)) {
    bond.events = bond.events.filter((event) => !event.entryId || !set.has(event.entryId));
    if (bond.entryId && set.has(bond.entryId) && bond.events.length === 0 && bond.manualDelta === 0) {
      delete state.bonds[name];
    }
  }
  state.items = state.items.filter((item) => !item.entryId || !set.has(item.entryId));
  if (Array.isArray(state.importantEvents)) {
    state.importantEvents = state.importantEvents.filter(
      (event) => !event.entryId || !set.has(event.entryId),
    );
  }
}

export function reconcileState(state: MnemeState, chat: ChatLike[]): ReconcileResult {
  const next = cloneData(state);

  // 如果刚刚触发了十卷自动合并为总卷，而用户紧接着删除了触发它的最后一楼，先解封最后一部总卷
  if (next.entries.length === 0 && next.volumes.length === 0 && Array.isArray(next.epochs) && next.epochs.length > 0) {
    const lastEpoch = next.epochs[next.epochs.length - 1];
    const lastVolInEpoch = lastEpoch.volumes[lastEpoch.volumes.length - 1];
    const hasDeletedFloor = lastVolInEpoch?.entries.some(
      (entry) => entry.messageId >= 0 && entry.messageId >= chat.length,
    );
    if (lastEpoch.auto && hasDeletedFloor) {
      next.epochs.pop();
      next.stats.sealedEpochs = Math.max(0, (next.stats.sealedEpochs ?? 1) - 1);
      next.volumes = lastEpoch.volumes;
    }
  }

  // 如果刚刚自动封卷，而用户紧接着删除了触发封卷的最后一楼，自动解封最后一卷以便回退
  if (next.entries.length === 0 && next.volumes.length > 0) {
    const lastVol = next.volumes[next.volumes.length - 1];
    const hasDeletedFloor = lastVol.entries.some(
      (entry) => entry.messageId >= 0 && entry.messageId >= chat.length,
    );
    if (lastVol.auto && hasDeletedFloor) {
      next.volumes.pop();
      next.stats.sealedVolumes = Math.max(0, next.stats.sealedVolumes - 1);
      next.entries = lastVol.entries;
    }
  }

  const buckets = new Map<string, number[]>();
  const addHash = (hash: string, index: number) => {
    if (!hash) return;
    const list = buckets.get(hash) ?? [];
    if (!list.includes(index)) list.push(index);
    buckets.set(hash, list);
  };

  chat.forEach((message, index) => {
    if (!message || message.is_user) return;
    const raw = String(message.mes ?? '');
    addHash(hashText(raw), index);
    const stripped = stripDelta(raw).text;
    addHash(hashText(stripped), index);
  });

  const used = new Set<number>();
  const dropped: string[] = [];
  let remapped = 0;

  for (const entry of next.entries) {
    // 手动添加的记忆条目不绑定具体楼层，永远保留
    if (entry.messageId < 0 || entry.source === 'manual') {
      continue;
    }

    const candidates = buckets.get(entry.mesHash);
    // 优先匹配原 messageId 相同的候选楼层
    let index = candidates?.find((c) => c === entry.messageId && !used.has(c));
    if (index === undefined) {
      index = candidates?.find((c) => !used.has(c));
    }

    // 兜底：若正文被酒馆其它正则/插件微调导致哈希不一致，只要该楼层仍在当前聊天范围内且属于 AI 回复，
    // 并且当前聊天长度大于1（即不是被整条替换的单楼测试场景），则保留该楼层记忆，绝不清空整卷
    if (
      index === undefined &&
      entry.messageId >= 0 &&
      entry.messageId < chat.length &&
      !chat[entry.messageId]?.is_user &&
      !used.has(entry.messageId)
    ) {
      index = entry.messageId;
    }

    if (index === undefined) {
      dropped.push(entry.id);
      continue;
    }

    used.add(index);
    if (index !== entry.messageId) {
      entry.messageId = index;
      remapped += 1;
    }
  }

  if (dropped.length > 0) {
    const droppedSet = new Set(dropped);

    // 检查是否是从尾部连续删除楼层（如删除最新楼层/重说最新楼层）
    const firstDroppedIdx = next.entries.findIndex((e) => droppedSet.has(e.id));
    if (firstDroppedIdx >= 0) {
      const firstDropped = next.entries[firstDroppedIdx];
      if (firstDropped?.prevSnapshot) {
        next.bonds = cloneData(firstDropped.prevSnapshot.bonds);
        next.items = cloneData(firstDropped.prevSnapshot.items);
        next.importantEvents = cloneData(firstDropped.prevSnapshot.importantEvents ?? []);
      }
    }

    next.entries = next.entries.filter((entry) => !droppedSet.has(entry.id));
    removeEntryLinks(next, dropped);
  }

  return { state: next, dropped, remapped };
}
