import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelta } from '../src/core/parse.ts';

test('parses a standard block', () => {
  const text = '正文。\n<!--MNEME\n{"summary":"他推门进来。","importance":"major"}\nMNEME-->';
  const r = parseDelta(text);
  assert.equal(r.ok, true);
  assert.equal(r.delta?.summary, '他推门进来。');
  assert.equal(r.delta?.importance, 'major');
});

test('parses decoupled bonds/items/events even when summary/memory is omitted', () => {
  const text =
    '正文。\n<!--MNEME\n{"bonds":[{"name":"沈栖迟","delta":1.5,"relation":"挚友"}],"items":[{"action":"gain","name":"铜铃","state":"完好","desc":"青铜铃铛"}]}\nMNEME-->';
  const r = parseDelta(text);
  assert.equal(r.ok, true);
  assert.equal(r.delta?.summary, '');
  assert.equal(r.delta?.bonds?.length, 1);
  assert.equal(r.delta?.bonds?.[0].delta, 1.5);
  assert.equal(r.delta?.items?.length, 1);
  assert.equal(r.delta?.items?.[0].condition, '完好');
  assert.equal(r.delta?.items?.[0].effect, '青铜铃铛');
});

test('extracts inline [重要] / [永久] tag from memory string', () => {
  const text = '<!--MNEME\n{"memory":"[重要]【深秋傍晚·书店】沈栖迟交出钥匙。"}\nMNEME-->';
  const r = parseDelta(text);
  assert.equal(r.ok, true);
  assert.equal(r.delta?.importance, 'major');
  assert.equal(r.delta?.summary, '【深秋傍晚·书店】沈栖迟交出钥匙。');
});

test('repairs smart quotes and trailing commas', () => {
  const text = '<!--MNEME {“summary”:“测试。”,} MNEME-->';
  const r = parseDelta(text);
  assert.equal(r.ok, true);
  assert.equal(r.delta?.summary, '测试。');
});

test('reports no-block when absent', () => {
  const r = parseDelta('只有正文');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-block');
});

test('keeps the block when JSON is invalid', () => {
  const r = parseDelta('<!--MNEME {oops} MNEME-->');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad-json');
  assert.ok(r.block);
});

test('accepts fenced mneme fallback', () => {
  const text = '正文\n```mneme\n{"summary":"雨停了。"}\n```';
  const r = parseDelta(text);
  assert.equal(r.ok, true);
  assert.equal(r.delta?.summary, '雨停了。');
});

test('rejects completely empty delta', () => {
  const r = parseDelta('<!--MNEME {"summary":""} MNEME-->');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid');
});
