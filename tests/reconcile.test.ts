import test from 'node:test';
import assert from 'node:assert/strict';
import { hashText } from '../src/core/hash.ts';
import { reconcileState } from '../src/core/reconcile.ts';
import { applyDelta } from '../src/core/reduce.ts';
import { createEmptyState } from '../src/core/schema.ts';
import { bondScore } from '../src/core/bonds.ts';

function entryFor(id: string, hash: string, messageId: number) {
  return {
    id,
    messageId,
    swipeId: 0,
    mesHash: hash,
    at: 0,
    storyTime: '',
    location: '',
    summary: id,
    characters: [],
    result: '',
    importance: 'normal' as const,
    volume: 1,
    source: 'model' as const,
  };
}

test('remaps message ids after an earlier message is deleted', () => {
  const state = createEmptyState();
  const keep = '她推门进来。';
  state.entries = [entryFor('e1', hashText(keep), 3)];
  const chat = [
    { mes: '第一句', is_user: true },
    { mes: keep, is_user: false },
  ];
  const r = reconcileState(state, chat);
  assert.equal(r.dropped.length, 0);
  assert.equal(r.state.entries[0].messageId, 1);
  assert.equal(r.remapped, 1);
});

test('deleting latest floor preserves all earlier entries and rolls back bond score, relation, impression, items, and important events', () => {
  let state = createEmptyState();
  // Floor 0
  state = applyDelta(
    state,
    {
      summary: '【傍晚·旧书店】初次相见',
      bonds: [
        {
          name: '沈栖迟',
          delta: 3.5,
          relation: '书店店主与访客',
          impression: '抱有戒心',
          majorEvent: '初见递信',
        },
      ],
      items: [{ action: 'gain', name: '旧信', effect: '引荐信' }],
    },
    { messageId: 0, swipeId: 0, mesHash: hashText('第一楼正文'), now: 1000, volumeSize: 10 },
  ).state;

  // Floor 1
  state = applyDelta(
    state,
    {
      summary: '【子时·钟楼】登上钟楼互换信物',
      bonds: [
        {
          name: '沈栖迟',
          delta: 4.2,
          relation: '共探钟楼的同伴',
          impression: '开始信任你',
          majorEvent: '钟楼托付铜铃',
        },
      ],
      items: [{ action: 'give', name: '怀表', holder: '沈栖迟', effect: '信物' }],
      events: [{ category: '誓言', title: '共守秘密', content: '绝不外泄钟楼秘密' }],
    },
    { messageId: 1, swipeId: 0, mesHash: hashText('第二楼正文'), now: 2000, volumeSize: 10 },
  ).state;

  assert.equal(state.entries.length, 2);
  assert.equal(bondScore(state.bonds['沈栖迟']), 7.7);
  assert.equal(state.bonds['沈栖迟'].relation, '共探钟楼的同伴');
  assert.equal(state.bonds['沈栖迟'].impression, '开始信任你');
  assert.equal(state.items.length, 2);
  assert.equal(state.importantEvents.length, 1);

  // User deletes Floor 1 (only Floor 0 remains in chat)
  const r = reconcileState(state, [{ mes: '第一楼正文（即使被正则微调也不会误删）', is_user: false }]);
  assert.equal(r.dropped.length, 1);
  assert.equal(r.state.entries.length, 1);
  assert.equal(r.state.entries[0].summary, '【傍晚·旧书店】初次相见');
  assert.equal(bondScore(r.state.bonds['沈栖迟']), 3.5);
  assert.equal(r.state.bonds['沈栖迟'].relation, '书店店主与访客');
  assert.equal(r.state.bonds['沈栖迟'].impression, '抱有戒心');
  assert.equal(r.state.bonds['沈栖迟'].events.length, 1);
  assert.equal(r.state.items.length, 1);
  assert.equal(r.state.items[0].name, '旧信');
  assert.equal(r.state.importantEvents.length, 0);
});
