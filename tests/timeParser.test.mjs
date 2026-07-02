import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDeterministicTime } from '../timeParser.mjs';

test('parses and converts English timezone expressions without OpenAI', () => {
  const result = parseDeterministicTime({
    text: 'tomorrow 3pm Pacific time',
    targetTimeZone: 'Asia/Shanghai',
    locale: 'en-US',
    now: '2026-07-01T02:00:00.000Z'
  });

  assert.equal(result.source, 'deterministic');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].sourceTimeZone, 'America/Los_Angeles');
  assert.equal(result.candidates[0].targetTimeZone, 'Asia/Shanghai');
  assert.match(result.candidates[0].sourceDisplay, /Jul 2, 2026, 3:00 PM/);
  assert.match(result.candidates[0].targetDisplay, /Jul 3, 2026, 6:00 AM/);
});

test('parses and converts Chinese timezone expressions without OpenAI', () => {
  const result = parseDeterministicTime({
    text: '北京时间明天下午3点',
    targetTimeZone: 'America/New_York',
    locale: 'zh-CN',
    now: '2026-07-01T02:00:00.000Z'
  });

  assert.equal(result.source, 'deterministic');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].sourceTimeZone, 'Asia/Shanghai');
  assert.equal(result.candidates[0].targetTimeZone, 'America/New_York');
  assert.equal(result.candidates[0].sourceDisplay, '2026年7月2日 15:00');
  assert.equal(result.candidates[0].targetDisplay, '2026年7月2日 03:00');
});

test('parses ISO timestamps with numeric offsets without OpenAI', () => {
  const result = parseDeterministicTime({
    text: '2014-11-30T08:15:30-05:30',
    targetTimeZone: 'Asia/Shanghai',
    locale: 'en-US',
    now: '2026-07-01T02:00:00.000Z'
  });

  assert.equal(result.source, 'deterministic');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].sourceTimeZone, 'UTC-05:30');
  assert.equal(result.candidates[0].targetTimeZone, 'Asia/Shanghai');
  assert.match(result.candidates[0].sourceDisplay, /Nov 30, 2014, 8:15\s?AM/);
  assert.match(result.candidates[0].targetDisplay, /Nov 30, 2014, 9:45 PM/);
});

test('formats English date ranges with US English standard', () => {
  const result = parseDeterministicTime({
    text: '17 August 2013 - 19 August 2013',
    targetTimeZone: 'Asia/Shanghai',
    locale: 'zh-CN',
    now: '2026-07-01T02:00:00.000Z'
  });

  assert.equal(result.source, 'deterministic');
  assert.equal(result.candidates[0].targetDisplay, 'Aug 17, 2013 - Aug 19, 2013');
  assert.equal(result.candidates[0].sourceDisplay, 'Aug 17, 2013 - Aug 19, 2013');
});

test('formats Chinese date ranges with Chinese standard', () => {
  const result = parseDeterministicTime({
    text: '2013年8月17日至2013年8月19日',
    targetTimeZone: 'Asia/Shanghai',
    locale: 'en-US',
    now: '2026-07-01T02:00:00.000Z'
  });

  assert.equal(result.source, 'deterministic');
  assert.equal(result.candidates[0].targetDisplay, '2013年8月17日至2013年8月19日');
  assert.equal(result.candidates[0].sourceDisplay, '2013年8月17日至2013年8月19日');
});

test('formats mixed Chinese and English input with US English standard', () => {
  const result = parseDeterministicTime({
    text: '北京时间 tomorrow 3pm',
    targetTimeZone: 'America/New_York',
    locale: 'zh-CN',
    now: '2026-07-01T02:00:00.000Z'
  });

  assert.equal(result.source, 'deterministic');
  assert.equal(result.candidates[0].sourceDisplay, 'Jul 2, 2026, 3:00 PM');
  assert.equal(result.candidates[0].targetDisplay, 'Jul 2, 2026, 3:00 AM');
});
