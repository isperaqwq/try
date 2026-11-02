import test from 'node:test';
import assert from 'node:assert/strict';
import { bondRelation, bondScore, formatScore } from '../src/core/bonds.ts';
import type { Bond } from '../src/core/types.ts';

function bond(initialScore: number, manualDelta: number, deltas: number[], relation?: string): Bond {
  return {
    name: 'A',
    initialScore,
    manualDelta,
    relation,
    impression: '',
    events: deltas.map((delta, i) => ({
      id: `e${i}`,
      text: 't',
      delta,
      importance: 'normal',
      at: 0,
      entryId: null,
      messageId: null,
    })),
    updatedAt: 0,
  };
}

test('computes decimal score without clamping to 0..100', () => {
  assert.equal(bondScore(bond(0, 0, [5, 5])), 10);
  assert.equal(bondScore(bond(0, 0.3, [1.2, 2.05])), 3.6);
  assert.equal(bondScore(bond(0, 0, [100, 100])), 200);
  assert.equal(bondScore(bond(0, 0, [-35.5])), -35.5);
  assert.equal(formatScore(12.34), '12.3');
});

test('returns custom relation or empty string when unset', () => {
  assert.equal(bondRelation(bond(0, 0, [])), '');
  assert.equal(bondRelation(bond(0, 0, [], '生死与共的守夜搭档')), '生死与共的守夜搭档');
});
