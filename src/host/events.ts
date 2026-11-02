import type { Delta } from '../core/types.ts';
import { parseDelta } from '../core/parse.ts';
import { stripDelta } from '../core/strip.ts';
import { hashText } from '../core/hash.ts';
import { applyDelta } from '../core/reduce.ts';
import { reconcileState } from '../core/reconcile.ts';
import { buildInjection } from '../core/inject.ts';
import { getCtx } from './context.ts';
import { store, loadFromChat, ensureStateForChat, commitState, flushState } from '../store/chat-state.ts';
import { readSettings, reloadSettings } from '../store/ui-settings.ts';
import { cloneData } from '../core/clone.ts';
import { panelState } from '../ui/panel-state.ts';
import { setWandDot } from './wand.ts';
import { scheduleInitParse } from './init-parse.ts';

let registered = false;

export function initHost(retries = 40): void {
  const ctx = getCtx();
  if (!ctx) {
    if (retries > 0) setTimeout(() => initHost(retries - 1), 250);
    return;
  }
  if (registered) return;
  registered = true;

  const events = ctx.eventTypes;
  ctx.eventSource.on(events.MESSAGE_RECEIVED, (id: number, type: string) => {
    void onMessageReceived(id, type);
  });
  ctx.eventSource.on(events.MESSAGE_EDITED, (id: number) => {
    void onMessageEdited(id);
  });
  ctx.eventSource.on(events.MESSAGE_DELETED, () => {
    void onMessageDeleted();
  });
  if (events.MESSAGE_SWIPED) {
    ctx.eventSource.on(events.MESSAGE_SWIPED, (id: number) => {
      void onMessageEdited(id);
    });
  }
  ctx.eventSource.on(events.CHAT_CHANGED, () => {
    void onChatChanged();
  });
  ctx.eventSource.on(events.GENERATION_STARTED, () => {
    refreshInjection();
  });

  reloadSettings();
  loadFromChat();
  refreshInjection();
  scheduleInitParse();
}

export function getCurrentInjectionText(): string {
  const ctx = getCtx();
  if (!store.state) return '';
  const settings = readSettings();
  if (!settings.enabled) return '';
  return buildInjection(store.state, settings, {
    userName: ctx?.name1 || 'user',
    charName: ctx?.characters?.[ctx?.characterId]?.name || 'char',
  });
}

export function refreshInjection(): void {
  const ctx = getCtx();
  if (!ctx) return;

  ensureStateForChat();

  const settings = readSettings();

  if (!settings.enabled || !store.state) {
    try {
      ctx.setExtensionPrompt('suiji', '', 1, 1, false, 0);
    } catch (error) {
      console.warn('[岁记] clear injection failed', error);
    }
    return;
  }

  const text = buildInjection(store.state, settings, {
    userName: ctx.name1 || 'user',
    charName: ctx.characters?.[ctx.characterId]?.name || 'char',
  });

  if (settings.debug) {
    console.info(
      '[岁记] refresh',
      JSON.stringify({
        enabled: settings.enabled,
        hasState: !!store.state,
        length: text.length,
      }),
    );
  }

  try {
    ctx.setExtensionPrompt('suiji', text, 1, 1, false, 0);
  } catch (error) {
    console.warn('[岁记] inject failed', error);
  }
}

export async function onMessageReceived(messageId: number, type: string): Promise<void> {
  const ctx = getCtx();
  if (!ctx || !ctx.chatMetadata) return;
  const state = ensureStateForChat();
  if (!state) return;

  if (type === 'first_message' || type === 'command') return;

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
    }
    return;
  }

  const stripped = stripDelta(original);
  const cleanText = stripped.text;
  const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;

  const delta: Delta =
    parsed.ok && parsed.delta
      ? parsed.delta
      : {
          summary: `（原始记录）${String(parsed.inner ?? '').slice(0, 400)}`,
          importance: 'normal',
        };

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
    } catch (error) {
      console.warn('[Mneme] rerender failed', error);
    }
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

export async function onMessageEdited(messageId: number): Promise<void> {
  const ctx = getCtx();
  if (!ctx || !store.state) return;

  const message = ctx.chat?.[messageId];
  if (!message) return;

  const settings = readSettings();
  const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
  const parsed = parseDelta(String(message.mes ?? ''));

  if (!parsed.ok || !parsed.delta) {
    const target = store.state.entries.find((entry) => entry.messageId === messageId);
    if (target) {
      const next = cloneData(store.state);
      const entry = next.entries.find((item) => item.id === target.id);
      if (entry) {
        entry.mesHash = hashText(stripDelta(String(message.mes ?? '')).text);
        entry.swipeId = swipeId;
        entry.stale = true;
        commitState(next);
        await flushState();
      }
    }
    return;
  }

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
    } catch (error) {
      console.warn('[Mneme] rerender failed', error);
    }
  }

  commitState(result.state);
  refreshInjection();
  await flushState();
}

export async function onMessageDeleted(): Promise<void> {
  const ctx = getCtx();
  if (!ctx || !store.state) return;

  const result = reconcileState(store.state, ctx.chat ?? []);
  if (result.dropped.length === 0 && result.remapped === 0) return;

  commitState(result.state);
  refreshInjection();
  await flushState();
}

export async function onChatChanged(): Promise<void> {
  panelState.missing = 0;
  panelState.raw = 0;
  panelState.trimmedLast = 0;
  panelState.trimmedAt = 0;
  panelState.ballDot = false;
  loadFromChat();
  refreshInjection();
  scheduleInitParse();
}
