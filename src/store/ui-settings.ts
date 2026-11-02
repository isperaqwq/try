import { reactive } from 'vue';
import type { MnemeSettings } from '../core/types.ts';
import { getCtx } from '../host/context.ts';

const DEFAULTS: MnemeSettings = {
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
    ballText: 'M',
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

export const settingsStore = reactive<MnemeSettings>(structuredClone(DEFAULTS));

export function mergeSettings(
  base: MnemeSettings,
  patch: Partial<MnemeSettings> | undefined,
): MnemeSettings {
  const merged: MnemeSettings = {
    ...base,
    ...(patch ?? {}),
    ui: { ...base.ui, ...((patch?.ui as Partial<MnemeSettings['ui']>) ?? {}) },
  };
  merged.enableMemory = merged.enableMemory !== false;
  merged.enableBonds = merged.enableBonds !== false;
  merged.enableItems = merged.enableItems !== false;
  merged.enableEvents = merged.enableEvents !== false;
  merged.volumeSize = Math.min(30, Math.max(5, Math.round(Number(merged.volumeSize) || 10)));
  merged.epochSize = Math.min(30, Math.max(2, Math.round(Number(merged.epochSize) || 10)));
  merged.majorRetentionVolumes = Math.max(
    0,
    Math.round(Number(merged.majorRetentionVolumes) || 0),
  );
  merged.tokenBudget = Math.max(200, Math.round(Number(merged.tokenBudget) || 2000));
  merged.keepRecentTurns = Math.min(
    40,
    Math.max(0, Math.round(Number(merged.keepRecentTurns) || 0)),
  );
  merged.trimContextEnabled = false;
  merged.autoStripBlock = merged.autoStripBlock !== false;
  merged.sealPrompt = String(merged.sealPrompt ?? '');
  merged.epochPrompt = String(merged.epochPrompt ?? '');

  const ui = merged.ui;
  ui.ballText = String(ui.ballText ?? 'M').trim().slice(0, 4) || 'M';
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

export function readSettings(): MnemeSettings {
  const ctx = getCtx();
  const ext = ctx?.extensionSettings;
  if (!ext) return mergeSettings(DEFAULTS, undefined);

  const source =
    ext.suiji && typeof ext.suiji === 'object'
      ? ext.suiji
      : ext.mneme && typeof ext.mneme === 'object'
        ? ext.mneme
        : {};
  ext.suiji = source;
  return mergeSettings(DEFAULTS, source);
}

function centeredUi(base: MnemeSettings['ui']): MnemeSettings['ui'] {
  if (typeof window === 'undefined') {
    return { ...base, x: 24, y: 80, positioned: true };
  }

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

function persistSettings(next: MnemeSettings): void {
  const ctx = getCtx();
  if (!ctx?.extensionSettings) return;
  const copy = JSON.parse(JSON.stringify(next));
  ctx.extensionSettings.suiji = copy;
  ctx.extensionSettings.mneme = copy;
  try {
    ctx.saveSettingsDebounced?.();
  } catch (error) {
    console.warn('[岁记] settings save failed', error);
  }
}

export function reloadSettings(): void {
  const merged = readSettings();
  let changed = false;

  if (!merged.settingsVersion || merged.settingsVersion < 3) {
    merged.autoInitBonds = false;
    merged.autoTimeline = false;
    merged.trimContextEnabled = false;
    if (merged.autoStripBlock === undefined) {
      merged.autoStripBlock = true;
    }
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

export function updateSettings(patch: Partial<MnemeSettings>): void {
  const next = mergeSettings(settingsStore, patch);
  Object.assign(settingsStore, next);
  Object.assign(settingsStore.ui, next.ui);
  persistSettings(next);
}

export function centerPanel(): void {
  updateSettings({ ui: centeredUi(settingsStore.ui) });
}
