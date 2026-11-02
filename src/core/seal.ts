import type { DeltaSeal, EpochVolume, MemoryEntry, MnemeState, Volume } from './types.ts';

export function formatEntryUnified(entry: Pick<MemoryEntry, 'summary' | 'storyTime' | 'location'>): string {
  const summary = String(entry.summary ?? '').trim();
  const time = String(entry.storyTime ?? '').trim();
  const loc = String(entry.location ?? '').trim();
  if ((time || loc) && !summary.startsWith('【')) {
    const prefix = [time, loc].filter(Boolean).join('·');
    if (prefix && !summary.includes(prefix)) {
      return `【${prefix}】${summary}`;
    }
  }
  return summary;
}

export function deriveTimeRange(entries: MemoryEntry[]): string {
  const times: string[] = [];
  for (const entry of entries) {
    if (entry.storyTime?.trim()) {
      times.push(entry.storyTime.trim());
      continue;
    }
    const match = entry.summary.match(/^【([^】]+)】/);
    if (match?.[1]) {
      const part = match[1].split('·')[0]?.trim();
      if (part) times.push(part);
    }
  }
  if (times.length === 0) return '';
  const first = times[0];
  const last = times[times.length - 1];
  return first === last ? first : `${first}-${last}`;
}

export function mechanicalRecap(entries: MemoryEntry[]): string {
  const range = deriveTimeRange(entries);
  const events = entries
    .map((entry) => {
      const full = formatEntryUnified(entry);
      return full.replace(/^【[^】]+】\s*/, '').replace(/[。；;]+$/, '');
    })
    .filter(Boolean);
  if (events.length === 0) return '';
  const joined = `${events.join('；')}。`;
  const prefix = range ? `【${range}】这些日子里，` : '【本卷回顾】这些日子里，';
  return `${prefix}${joined}`.slice(0, 1200);
}

export function formatVolumeRecap(timeRange: string, recap: string): string {
  const cleanRecap = String(recap ?? '').trim();
  const cleanRange = String(timeRange ?? '').trim();
  if (!cleanRecap) return '';
  if (cleanRange && !cleanRecap.startsWith('【')) {
    return `【${cleanRange}】${cleanRecap}`;
  }
  return cleanRecap;
}

export function sealVolume(
  state: MnemeState,
  seal: DeltaSeal | undefined,
  _size: number,
): Volume {
  const index = state.stats.sealedVolumes + 1;
  const entries = state.entries.map((entry) => {
    const copy = { ...entry };
    delete copy.prevSnapshot;
    return copy;
  });
  const title = (seal?.title ?? '').trim() || `第 ${index} 卷`;
  const timeRange =
    (seal?.timeRange ?? seal?.time_range ?? seal?.time ?? '').trim() ||
    deriveTimeRange(entries);
  const provided = (seal?.recap ?? '').trim();
  const rawRecap = provided ? formatVolumeRecap(timeRange, provided) : mechanicalRecap(entries);

  const volume: Volume = {
    index,
    title,
    timeRange,
    recap: rawRecap.slice(0, 1500),
    entries,
    sealedAt: Date.now(),
    auto: !provided,
  };

  state.volumes.push(volume);
  state.stats.sealedVolumes = index;
  state.entries = [];
  return volume;
}

export function deriveEpochTimeRange(volumes: Volume[]): string {
  const parts: string[] = [];
  for (const vol of volumes) {
    if (vol.timeRange?.trim()) {
      parts.push(vol.timeRange.trim());
      continue;
    }
    const match = vol.recap.match(/^【([^】]+)】/);
    if (match?.[1]) parts.push(match[1].trim());
  }
  if (parts.length === 0) return '';
  const first = parts[0].split(/[-～~]/)[0]?.trim() || parts[0];
  const lastRaw = parts[parts.length - 1];
  const lastParts = lastRaw.split(/[-～~]/);
  const last = lastParts[lastParts.length - 1]?.trim() || lastRaw;
  return first === last ? first : `${first}-${last}`;
}

export function mechanicalEpochRecap(volumes: Volume[]): string {
  const range = deriveEpochTimeRange(volumes);
  const summaries = volumes
    .map((vol) => {
      const clean = String(vol.recap ?? '')
        .replace(/^【[^】]+】\s*/, '')
        .replace(/^这些日子里[，,]?\s*/, '')
        .replace(/[。；;]+$/, '')
        .trim();
      return clean ? `《${vol.title}》：${clean}` : '';
    })
    .filter(Boolean);
  if (summaries.length === 0) return '';
  const prefix = range ? `【${range}】这些日子里，` : '【总卷回顾】这些日子里，';
  return `${prefix}${summaries.join('；')}。`.slice(0, 1800);
}

export function sealEpoch(
  state: MnemeState,
  epoch: DeltaSeal | undefined,
  _size: number,
): EpochVolume {
  if (!Array.isArray(state.epochs)) state.epochs = [];
  const currentEpochs = state.stats.sealedEpochs ?? state.epochs.length;
  const index = currentEpochs + 1;
  const volumes = state.volumes.map((vol) => ({ ...vol, entries: [...vol.entries] }));
  const firstIdx = volumes[0]?.index ?? 1;
  const lastIdx = volumes[volumes.length - 1]?.index ?? volumes.length;

  const title = (epoch?.title ?? '').trim() || `第 ${firstIdx}～${lastIdx} 卷合集`;
  const timeRange =
    (epoch?.timeRange ?? epoch?.time_range ?? epoch?.time ?? '').trim() ||
    deriveEpochTimeRange(volumes);
  const provided = (epoch?.recap ?? '').trim();
  const rawRecap = provided ? formatVolumeRecap(timeRange, provided) : mechanicalEpochRecap(volumes);

  const epochVol: EpochVolume = {
    index,
    title,
    timeRange,
    recap: rawRecap.slice(0, 2000),
    volumes,
    sealedAt: Date.now(),
    auto: !provided,
  };

  state.epochs.push(epochVol);
  state.stats.sealedEpochs = index;
  state.volumes = [];
  return epochVol;
}
