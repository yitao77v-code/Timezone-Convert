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


test('defers mixed-zone input instead of applying one global source zone', () => {
  for (const text of [
    'July 1, 2026 at 9am EST and July 1, 2026 at 9am PST',
    'July 1, 2026 at 9am EST and July 1, 2026 at 9am EDT',
    'July 1, 2026 at 9am America/New_York and July 1, 2026 at 9am Asia/Tokyo',
    'July 1, 2026 at 9am UTC+8 and July 1, 2026 at 9am UTC-5',
    'July 1, 2026 at 9am Pacific time and July 1, 2026 at 9am UTC'
  ]) {
    assert.equal(parseDeterministicTime({ text, targetTimeZone: 'UTC' }), null, text);
  }
});

test('explicit standard-time abbreviations retain their winter offsets in summer', () => {
  for (const [abbreviation, zone, hour] of [
    ['EST', 'UTC-5', '8:00 PM'],
    ['CST', 'UTC-6', '9:00 PM'],
    ['MST', 'UTC-7', '10:00 PM'],
    ['PST', 'UTC-8', '11:00 PM']
  ]) {
    const result = parseDeterministicTime({
      text: `July 1, 2026 at 3pm ${abbreviation}`,
      targetTimeZone: 'UTC'
    });
    assert.equal(result.candidates[0].sourceTimeZone, zone);
    assert.equal(result.candidates[0].targetDisplay, `Jul 1, 2026, ${hour}`);
  }
});

test('explicit daylight-time abbreviations retain their summer offsets in winter', () => {
  for (const [abbreviation, zone, hour] of [
    ['EDT', 'UTC-4', '7:00 PM'],
    ['CDT', 'UTC-5', '8:00 PM'],
    ['MDT', 'UTC-6', '9:00 PM'],
    ['PDT', 'UTC-7', '10:00 PM']
  ]) {
    const result = parseDeterministicTime({
      text: `January 1, 2026 at 3pm ${abbreviation}`,
      targetTimeZone: 'UTC'
    });
    assert.equal(result.candidates[0].sourceTimeZone, zone);
    assert.equal(result.candidates[0].targetDisplay, `Jan 1, 2026, ${hour}`);
  }
});

test('explicit long standard and daylight names use fixed offsets', () => {
  const standard = parseDeterministicTime({
    text: 'July 1, 2026 at 3pm Eastern Standard Time', targetTimeZone: 'UTC'
  });
  const daylight = parseDeterministicTime({
    text: 'January 1, 2026 at 3pm Pacific Daylight Time', targetTimeZone: 'UTC'
  });
  assert.equal(standard.candidates[0].targetDisplay, 'Jul 1, 2026, 8:00 PM');
  assert.equal(daylight.candidates[0].targetDisplay, 'Jan 1, 2026, 10:00 PM');
});

test('regional Eastern Time continues to follow daylight saving rules', () => {
  const summer = parseDeterministicTime({
    text: 'July 1, 2026 at 3pm Eastern time', targetTimeZone: 'UTC'
  });
  const winter = parseDeterministicTime({
    text: 'January 1, 2026 at 3pm ET', targetTimeZone: 'UTC'
  });
  assert.equal(summer.candidates[0].targetDisplay, 'Jul 1, 2026, 7:00 PM');
  assert.equal(winter.candidates[0].targetDisplay, 'Jan 1, 2026, 8:00 PM');
});

test('CST exposes its ambiguity and the chosen offset', () => {
  const result = parseDeterministicTime({
    text: 'July 1, 2026 at 3pm CST', targetTimeZone: 'UTC'
  });
  assert.ok(result.candidates[0].notices.some((notice) =>
    /CST is ambiguous/.test(notice) && /UTC-06:00/.test(notice)));
});

test('fixed UTC offsets and repeated same-zone mentions remain deterministic', () => {
  const offset = parseDeterministicTime({
    text: 'July 1, 2026 at 3pm UTC+8', targetTimeZone: 'UTC'
  });
  assert.equal(offset.candidates[0].targetDisplay, 'Jul 1, 2026, 7:00 AM');
  const repeated = parseDeterministicTime({
    text: 'July 1, 2026 at 9am EST and July 2, 2026 at 9am EST', targetTimeZone: 'UTC'
  });
  assert.equal(repeated.candidates.length, 2);
  assert.ok(repeated.candidates.every((candidate) => candidate.sourceTimeZone === 'UTC-5'));
});

test('does not silently return only the first ISO timestamp from mixed expressions', () => {
  for (const text of [
    '2026-07-01T09:00:00-05:00 and 2026-07-01T09:00:00+08:00',
    '2026-07-01T09:00:00-05:00 and July 2, 2026 at 9am PST'
  ]) {
    assert.equal(parseDeterministicTime({ text, targetTimeZone: 'UTC' }), null);
  }
});

test('defers ordinal weekday-in-month phrases instead of emitting unrelated dates', () => {
  for (const text of [
    'The last Friday in November 2026 at fifteen hundred Tokyo time',
    'The first Monday of December 2026 at 3pm Pacific time'
  ]) {
    assert.equal(parseDeterministicTime({ text, targetTimeZone: 'UTC' }), null);
  }
});
