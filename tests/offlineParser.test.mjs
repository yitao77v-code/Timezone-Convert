import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalTime } from '../offlineParser.mjs';

const parse = text => parseLocalTime({ text, targetTimeZone: 'Asia/Shanghai', locale: 'en-US', now: '2026-10-27T10:00:00Z' });

test('offline parser converts the store example', () => {
  assert.equal(parse('October 27, 2026 at 3pm UTC').candidates[0].targetDisplay, 'Oct 27, 2026, 11:00 PM');
});

test('offline parser handles Chinese dates with an English UTC marker', () => {
  assert.equal(parse('2026年10月27日下午3点 UTC').candidates[0].targetDisplay, 'Oct 27, 2026, 11:00 PM');
});

test('DST gaps and ambiguous overlaps require an explicit offset', () => {
  for (const text of ['March 8, 2026 at 2:30am America/New_York', 'November 1, 2026 at 1:30am America/New_York']) {
    const result = parse(text);
    assert.equal(result.candidates.length, 0, text);
    assert.match(result.message, /UTC offset/);
  }
  assert.equal(parse('November 1, 2026 at 1:30am UTC-4').candidates[0].targetDisplay, 'Nov 1, 2026, 1:30 PM');
});

test('invalid offsets, missing zones, mixed zones and unsupported expressions are rejected', () => {
  for (const text of ['October 27, 2026 at 3pm UTC+99', 'October 27, 2026 at 3pm UTC+08:90', 'tomorrow at 3pm', 'October 27, 2026 3pm UTC and October 27, 2026 4pm PST', 'last Friday of October 2026 at 3pm UTC', 'hello there']) {
    assert.equal(parse(text).candidates.length, 0, text);
  }
});

test('oversize input is rejected before parsing', () => {
  assert.match(parse('x'.repeat(10001)).message, /shorter passage/);
});
