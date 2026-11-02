import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDelta, removeEntry } from '../src/core/reduce.ts';
import { createEmptyState } from '../src/core/schema.ts';
import { bondScore } from '../src/core/bonds.ts';

const meta = { messageId: 1, swipeId: 0, mesHash: 'h1', now: 1000, volumeSize: 10 };

test('creates an entry, decimal bond score, and only records major bond events when provided', () => {
  const r1 = applyDelta(
    createEmptyState(),
    {
      summary: '【傍晚·书店】他推门进来。',
      importance: 'major',
      bonds: [
        {
          name: '甲',
          delta: 3.5,
          relation: '初识访客',
          impression: '眼神温和',
          majorEvent: '初次见面递交书信',
        },
      ],
    },
    meta,
  );

  assert.equal(r1.state.entries.length, 1);
  assert.equal(r1.state.entries[0].summary, '【傍晚·书店】他推门进来。');
  assert.equal(r1.state.bonds['甲'].events.length, 1);
  assert.equal(r1.state.bonds['甲'].relation, '初识访客');
  assert.equal(bondScore(r1.state.bonds['甲']), 3.5);

  // Routine turn with delta but no majorEvent: score increases, events list does not bloat
  const r2 = applyDelta(
    r1.state,
    {
      summary: '【入夜·书店】两人闲聊了几句。',
      bonds: [{ name: '甲', delta: 0.4, impression: '聊得投机' }],
    },
    { ...meta, messageId: 2, mesHash: 'h2', now: 2000 },
  );
  assert.equal(bondScore(r2.state.bonds['甲']), 3.9);
  assert.equal(r2.state.bonds['甲'].events.length, 1);
  assert.equal(r2.state.bonds['甲'].impression, '聊得投机');
});

test('strips 涉及/锚点 lines from the summary body', () => {
  const r = applyDelta(
    createEmptyState(),
    {
      summary: '正文第一句。\n涉及：甲\n锚点：指尖停在书脊上。\n正文第二句。',
      importance: 'major',
      characters: ['甲'],
      anchor: '指尖停在书脊上',
    },
    meta,
  );
  assert.equal(r.state.entries[0].summary, '正文第一句。\n正文第二句。');
  assert.deepEqual(r.state.entries[0].characters, ['甲']);
  assert.equal(r.state.entries[0].anchor, '指尖停在书脊上');
});

test('normal entries drop characters and anchor', () => {
  const r = applyDelta(
    createEmptyState(),
    { summary: '普通的一天。', characters: ['甲'], anchor: '某个细节' },
    meta,
  );
  assert.deepEqual(r.state.entries[0].characters, []);
  assert.equal(r.state.entries[0].anchor, undefined);
});

test('regenerating the same messageId rolls back previous turn delta before applying new delta', () => {
  const first = applyDelta(
    createEmptyState(),
    {
      summary: '第一版',
      bonds: [{ name: '甲', delta: 5, relation: '朋友', impression: '第一版印象' }],
      items: [{ action: 'gain', name: '第一版道具', effect: '旧效果' }],
    },
    meta,
  );
  const second = applyDelta(
    first.state,
    {
      summary: '第二版（重说）',
      bonds: [{ name: '甲', delta: 2.3, relation: '盟友', impression: '第二版印象' }],
      items: [{ action: 'give', name: '怀表', holder: '甲', effect: '赠予甲的信物' }],
    },
    { ...meta, swipeId: 1, mesHash: 'h1-reroll' },
  );
  assert.equal(second.state.entries.length, 1);
  assert.equal(second.state.entries[0].summary, '第二版（重说）');
  assert.equal(bondScore(second.state.bonds['甲']), 2.3);
  assert.equal(second.state.bonds['甲'].relation, '盟友');
  assert.equal(second.state.bonds['甲'].impression, '第二版印象');
  assert.equal(second.state.items.length, 1);
  assert.equal(second.state.items[0].name, '怀表');
  assert.equal(second.state.items[0].status, 'gifted');
  assert.equal(second.state.items[0].holder, '甲');
});

test('seals at the configured size and removes entries from the active list', () => {
  let state = createEmptyState();
  for (let i = 0; i < 10; i += 1) {
    const result = applyDelta(
      state,
      { summary: `第${i + 1}条` },
      {
        messageId: i,
        swipeId: 0,
        mesHash: `h${i}`,
        now: 1000 + i,
        volumeSize: 10,
      },
    );
    state = result.state;
  }
  assert.equal(state.entries.length, 0);
  assert.equal(state.volumes.length, 1);
  assert.equal(state.volumes[0].auto, true);
  assert.equal(state.stats.sealedVolumes, 1);
});

test('uses model-provided seal when available', () => {
  let state = createEmptyState();
  for (let i = 0; i < 9; i += 1) {
    state = applyDelta(
      state,
      { summary: `第${i + 1}条` },
      {
        messageId: i,
        swipeId: 0,
        mesHash: `h${i}`,
        now: 1000 + i,
        volumeSize: 10,
      },
    ).state;
  }
  const result = applyDelta(
    state,
    {
      summary: '第10条',
      seal: { title: '雨与灰烬', recap: '这一卷的复盘。' },
    },
    { messageId: 9, swipeId: 0, mesHash: 'h9', now: 1010, volumeSize: 10 },
  );

  assert.equal(result.sealed?.title, '雨与灰烬');
  assert.equal(result.sealed?.auto, false);
});

test('removing an entry rolls back bond score, relation, impression, items, and important events', () => {
  const r = applyDelta(
    createEmptyState(),
    {
      summary: '一件事',
      bonds: [{ name: '甲', delta: 8.5, relation: '恋人', impression: '深信不疑', majorEvent: '一起逃雨' }],
      items: [{ action: 'gain', name: '伞', effect: '遮雨' }],
      events: [{ category: '约定', title: '雨停再会', content: '约定明日再见' }],
    },
    meta,
  );
  const next = removeEntry(r.state, r.entry.id);
  assert.equal(next.entries.length, 0);
  assert.equal(bondScore(next.bonds['甲'] ?? { name: '甲', initialScore: 0, manualDelta: 0, impression: '', events: [], updatedAt: 0 }), 0);
  assert.equal(next.items.length, 0);
  assert.equal(next.importantEvents.length, 0);
});

test('merges sealed volumes into a 3rd-tier epoch when volumes reach epochSize', () => {
  let state = createEmptyState();
  // volumeSize = 5, epochSize = 2 => after 10 entries, 2 volumes seal and merge into 1 epoch
  for (let i = 0; i < 10; i += 1) {
    const res = applyDelta(
      state,
      { summary: `【1924年10月${10 + i}日傍晚·旧书店】第${i + 1}条记忆。` },
      {
        messageId: i,
        swipeId: 0,
        mesHash: `h${i}`,
        now: 1000 + i,
        volumeSize: 5,
        epochSize: 2,
      },
    );
    state = res.state;
  }
  assert.equal(state.entries.length, 0);
  assert.equal(state.volumes.length, 0);
  assert.equal(state.epochs?.length, 1);
  assert.equal(state.epochs?.[0].volumes.length, 2);
  assert.equal(state.stats.sealedVolumes, 2);
  assert.equal(state.stats.sealedEpochs, 1);
  assert.match(state.epochs?.[0].timeRange ?? '', /1924年10月10日.*1924年10月19日/);
});
