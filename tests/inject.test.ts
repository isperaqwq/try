import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInjection, estimateTokens } from '../src/core/inject.ts';
import { createEmptyState } from '../src/core/schema.ts';
import type { MnemeSettings } from '../src/core/types.ts';

const settings: MnemeSettings = {
  enabled: true,
  enableMemory: true,
  enableBonds: true,
  enableItems: true,
  enableEvents: true,
  volumeSize: 10,
  majorRetentionVolumes: 2,
  tokenBudget: 2000,
  keepRecentTurns: 10,
  trimContextEnabled: false,
  autoStripBlock: true,
  directorView: 'current',
  autoInitBonds: true,
  autoTimeline: false,
  showMissingBadge: true,
  debug: false,
  summaryPrompt: '',
  sealPrompt: '',
  ui: {
    theme: 'auto',
    accent: '#b08d57',
    x: 0,
    y: 0,
    width: 420,
    height: 560,
    minimized: false,
    fontSize: 14,
    ballVisible: true,
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

const deps = { userName: 'user', charName: '甲' };

test('estimates CJK heavier than ASCII', () => {
  assert.ok(estimateTokens('中文中文') > estimateTokens('abcd'));
});

test('includes instruction, recent memory, bonds, items (with condition & holder) and important events', () => {
  const state = createEmptyState();
  state.bonds['甲'] = {
    name: '甲',
    initialScore: 12.5,
    manualDelta: 0,
    relation: '青梅竹马的挚友',
    impression: '有点好奇',
    events: [],
    updatedAt: 0,
  };
  state.items.push(
    {
      id: 'i1',
      name: '铜钥匙',
      holder: 'user',
      condition: '完好',
      source: '书店老板',
      effect: '开钟楼门',
      status: 'held',
      acquiredAt: 0,
      entryId: null,
      messageId: null,
    },
    {
      id: 'i2',
      name: '银怀表',
      holder: '甲',
      condition: '贴身保管',
      source: 'user赠予',
      effect: '联络信物',
      status: 'gifted',
      acquiredAt: 0,
      entryId: null,
      messageId: null,
    },
  );
  state.importantEvents.push({
    id: 'ev1',
    title: '钟楼之约',
    category: '约定',
    content: '约定子时一同登上钟楼',
    characters: ['user', '甲'],
    at: 0,
    entryId: null,
    messageId: null,
  });
  state.entries.push({
    id: 'e1',
    messageId: 1,
    swipeId: 0,
    mesHash: 'h',
    at: 0,
    storyTime: '傍晚',
    location: '书店',
    summary: '两人在雨里躲进书店。',
    characters: ['甲'],
    result: '',
    importance: 'normal',
    volume: 1,
    source: 'model',
  });

  const text = buildInjection(state, settings, deps);
  assert.match(text, /Mneme·记录要求/);
  assert.match(text, /【傍晚·书店】两人在雨里躲进书店/);
  assert.match(text, /青梅竹马的挚友/);
  assert.match(text, /12\.5/);
  assert.match(text, /有点好奇/);
  assert.match(text, /铜钥匙/);
  assert.match(text, /状态：完好/);
  assert.match(text, /银怀表/);
  assert.match(text, /已赠出；状态：贴身保管；持有者：甲/);
  assert.match(text, /Mneme·重要事件与誓言/);
  assert.match(text, /钟楼之约/);
});

test('supports selective module injection and prompt generation (e.g. only bonds and items enabled)', () => {
  const state = createEmptyState();
  state.entries.push({
    id: 'e1',
    messageId: 1,
    swipeId: 0,
    mesHash: 'h',
    at: 0,
    storyTime: '',
    location: '',
    summary: '被关闭的记忆模块内容',
    characters: [],
    result: '',
    importance: 'normal',
    volume: 1,
    source: 'model',
  });
  state.bonds['甲'] = {
    name: '甲',
    initialScore: 20,
    manualDelta: 0,
    relation: '同伴',
    impression: '信任',
    events: [],
    updatedAt: 0,
  };

  const text = buildInjection(
    state,
    {
      ...settings,
      enableMemory: false,
      enableEvents: false,
      enableBonds: true,
      enableItems: false,
    },
    deps,
  );

  assert.doesNotMatch(text, /被关闭的记忆模块内容/);
  assert.doesNotMatch(text, /"summary"/);
  assert.doesNotMatch(text, /"items"/);
  assert.doesNotMatch(text, /"events"/);
  assert.match(text, /Mneme·羁绊/);
  assert.match(text, /"bonds"/);
});

test('drops volume recaps first when over budget', () => {
  const state = createEmptyState();
  state.entries.push({
    id: 'e1',
    messageId: 1,
    swipeId: 0,
    mesHash: 'h',
    at: 0,
    storyTime: '',
    location: '',
    summary: '关键近忆',
    characters: [],
    result: '',
    importance: 'normal',
    volume: 1,
    source: 'model',
  });

  const baseline = buildInjection(state, { ...settings, tokenBudget: 100000 }, deps);
  const budget = estimateTokens(baseline) + 20;

  state.volumes.push({
    index: 1,
    title: '第一卷',
    timeRange: '十月一日-十月五日',
    recap: '很长的复盘'.repeat(200),
    entries: [],
    sealedAt: 0,
    auto: true,
  });

  const text = buildInjection(state, { ...settings, tokenBudget: budget }, deps);
  assert.doesNotMatch(text, /很长的复盘/);
  assert.match(text, /关键近忆/);
  assert.match(text, /Mneme·记录要求/);
});

test('uses a custom summary prompt when provided', () => {
  const state = createEmptyState();
  const text = buildInjection(
    state,
    { ...settings, summaryPrompt: '只输出 JSON，字段按我的要求来。' },
    deps,
  );
  assert.match(text, /字段按我的要求来/);

  const fallback = buildInjection(state, { ...settings, summaryPrompt: '   ' }, deps);
  assert.match(fallback, /【xx年xx月xx日/);
  assert.match(fallback, /"importance": "normal"/);
});

test('includes <Mneme·总卷> when epochs exist', () => {
  const state = createEmptyState();
  state.epochs = [
    {
      index: 1,
      title: '第一部：雾城秋雨',
      timeRange: '1924年10月1日-1924年10月22日',
      recap: '【1924年10月1日-1924年10月22日】这些日子里，主角与甲在雾城结识并探查钟楼秘密。',
      volumes: [],
      sealedAt: 0,
      auto: false,
    },
  ];
  const text = buildInjection(state, settings, deps);
  assert.match(text, /Mneme·总卷/);
  assert.match(text, /第一部：雾城秋雨/);
  assert.match(text, /1924年10月1日-1924年10月22日/);
});

test('never drops current summaries or importantEvents even under a tiny budget', () => {
  const state = createEmptyState();
  for (let i = 1; i <= 3; i += 1) {
    state.entries.push({
      id: `e${i}`,
      messageId: i,
      swipeId: 0,
      mesHash: `h${i}`,
      at: i,
      storyTime: '',
      location: '',
      summary: `必须保留的摘要${i}`,
      characters: [],
      result: '',
      importance: 'normal',
      volume: 1,
      source: 'model',
    });
  }
  state.importantEvents.push({
    id: 'imp1',
    title: '生死誓言',
    category: '誓言',
    content: '绝不背叛彼此',
    characters: ['user', '甲'],
    at: 0,
    entryId: null,
    messageId: null,
  });

  const text = buildInjection(state, { ...settings, tokenBudget: 1 }, deps);
  assert.match(text, /必须保留的摘要1/);
  assert.match(text, /必须保留的摘要2/);
  assert.match(text, /必须保留的摘要3/);
  assert.match(text, /生死誓言/);
});
