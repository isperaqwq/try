import test from 'node:test';
import assert from 'node:assert/strict';
import { stripDelta } from '../src/core/strip.ts';

test('removes the block and preserves the body', () => {
  const body = '她抬头看了你一眼。';
  const out = stripDelta(`${body}\n\n<!--MNEME\n{"summary":"x"}\nMNEME-->`);
  assert.equal(out.text, body);
  assert.equal(out.removed, true);
});

test('leaves plain text and normal json code blocks untouched', () => {
  const proseWithJson = '只是普通正文。\n```json\n{"summary":"这是正文里的代码块，不应被误裁"}\n```';
  const out = stripDelta(proseWithJson);
  assert.equal(out.text, proseWithJson);
  assert.equal(out.removed, false);
});

test('removes an unparsable MNEME block too', () => {
  const out = stripDelta('正文\n<!--MNEME {oops} MNEME-->');
  assert.equal(out.text, '正文');
  assert.equal(out.removed, true);
});
