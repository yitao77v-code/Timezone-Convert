import * as chrono from 'chrono-node';
import { DateTime, FixedOffsetZone, IANAZone } from 'luxon';

const ZONE_ALIASES = [
  // Explicit standard/daylight names denote fixed offsets, regardless of the date.
  [/pacific\s+standard\s+time|\bPST\b/i, 'UTC-8'],
  [/pacific\s+daylight\s+time|\bPDT\b/i, 'UTC-7'],
  [/eastern\s+standard\s+time|\bEST\b/i, 'UTC-5'],
  [/eastern\s+daylight\s+time|\bEDT\b/i, 'UTC-4'],
  [/central\s+standard\s+time|\bCST\b/i, 'UTC-6'],
  [/central\s+daylight\s+time|\bCDT\b/i, 'UTC-5'],
  [/mountain\s+standard\s+time|\bMST\b/i, 'UTC-7'],
  [/mountain\s+daylight\s+time|\bMDT\b/i, 'UTC-6'],
  [/pacific\s+time|\bPT\b/i, 'America/Los_Angeles', 'Pacific Time'],
  [/eastern\s+time|\bET\b/i, 'America/New_York', 'Eastern Time'],
  [/central\s+time|\bCT\b/i, 'America/Chicago', 'Central Time'],
  [/mountain\s+time|\bMT\b/i, 'America/Denver', 'Mountain Time'],
  [/beijing\s+time|china\s+time|shanghai\s+time|北京时间|中国时间|上海时间/i, 'Asia/Shanghai', 'China Standard Time'],
  [/singapore\s+time|\bSGT\b|新加坡时间/i, 'Asia/Singapore', 'Singapore Time'],
  [/hong\s+kong\s+time|\bHKT\b|香港时间/i, 'Asia/Hong_Kong', 'Hong Kong Time'],
  [/india\s+time|\bIST\b|印度时间/i, 'Asia/Kolkata', 'India Time'],
  [/japan\s+time|tokyo\s+time|\bJST\b|日本时间|东京时间/i, 'Asia/Tokyo', 'Japan Time'],
  [/london\s+time|英国时间|伦敦时间/i, 'Europe/London', 'London Time'],
  [/paris\s+time|europe\s+time|欧洲时间|巴黎时间/i, 'Europe/Paris', 'Europe Time'],
  [/berlin\s+time|germany\s+time|德国时间/i, 'Europe/Berlin', 'Germany Time'],
  [/\bUTC\b|\bGMT\b/i, 'UTC', 'UTC']
];

export function parseDeterministicTime(payload) {
  const text = String(payload.text || '').trim();
  const targetTimeZone = normalizeZone(payload.targetTimeZone || 'UTC');
  const now = payload.now ? new Date(payload.now) : new Date();
  const locale = payload.locale || 'en-US';
  const outputLocale = detectOutputLocale(text);

  if (!text) return { source: 'deterministic', candidates: [], message: 'No input.' };
  if (!isValidZone(targetTimeZone)) return null;
  // Chrono can split this relation into unrelated dates instead of resolving it.
  if (/\b(?:first|second|third|fourth|fifth|last)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:in|of)\b/i.test(text)) return null;

  const sourceZones = detectSourceZones(text);
  // A global zone cannot safely be assigned to every expression in mixed-zone text.
  if (sourceZones.length > 1) return null;

  const isoTimestamps = text.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\b/g) || [];
  if (isoTimestamps.length > 1 || (isoTimestamps.length && sourceZones.length)) return null;

  const isoResult = parseIsoOffsetTime(text, targetTimeZone, outputLocale);
  if (isoResult) return isoResult;

  const chronoLocale = selectChronoLocale(locale, text);
  const parsed = chronoLocale.parse(text, now, { forwardDate: true }).slice(0, 5);
  if (!parsed.length) return null;

  const sourceZone = sourceZones[0] ?? inferDateOnlyZone(parsed, targetTimeZone);
  if (!sourceZone) return null;

  const candidates = parsed
    .map((item) => toCandidate(item, text, sourceZone, targetTimeZone, outputLocale))
    .filter(Boolean);

  if (!candidates.length) return null;

  return {
    source: 'deterministic',
    candidates,
    message: 'Parsed locally with chrono-node and converted with Luxon.'
  };
}

function parseIsoOffsetTime(text, targetTimeZone, outputLocale) {
  const isoMatch = text.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\b/);
  if (!isoMatch) return null;

  const sourceDate = DateTime.fromISO(isoMatch[0], { setZone: true });
  if (!sourceDate.isValid) return null;

  const targetDate = sourceDate.setZone(targetTimeZone);
  if (!targetDate.isValid) return null;

  return {
    source: 'deterministic',
    candidates: [{
      sourceText: isoMatch[0],
      sourceTimeZone: formatOffset(sourceDate),
      targetTimeZone,
      sourceDisplay: formatDateTime(sourceDate, outputLocale, true),
      targetDisplay: formatDateTime(targetDate, outputLocale, true),
      confidence: 0.99,
      explanation: '',
      notices: []
    }],
    message: 'Parsed ISO timestamp locally with Luxon.'
  };
}

function toCandidate(item, originalText, sourceZone, targetTimeZone, outputLocale) {
  const start = item.start;
  const year = start.get('year');
  const month = start.get('month');
  const day = start.get('day');
  const hour = start.get('hour') ?? 0;
  const minute = start.get('minute') ?? 0;
  const second = start.get('second') ?? 0;
  const hasExplicitTime = start.isCertain?.('hour') || start.isCertain?.('minute');

  if (!year || !month || !day) return null;

  const sourceDate = DateTime.fromObject({ year, month, day, hour, minute, second }, { zone: sourceZone.zone });
  if (!sourceDate.isValid) return null;

  const targetDate = sourceDate.setZone(targetTimeZone);
  if (!targetDate.isValid) return null;

  const endSourceDate = item.end ? toDateTime(item.end, sourceZone.zone) : null;
  const endTargetDate = endSourceDate ? endSourceDate.setZone(targetTimeZone) : null;

  return {
    sourceText: originalText,
    sourceTimeZone: sourceZone.zone,
    targetTimeZone,
    sourceDisplay: endSourceDate
      ? formatRange(sourceDate, endSourceDate, outputLocale, hasExplicitTime)
      : formatDateTime(sourceDate, outputLocale, hasExplicitTime),
    targetDisplay: endTargetDate
      ? formatRange(targetDate, endTargetDate, outputLocale, hasExplicitTime)
      : formatDateTime(targetDate, outputLocale, hasExplicitTime),
    confidence: sourceZone.confidence,
    explanation: `Converted from ${sourceZone.zone} (${formatOffset(sourceDate)}) to ${targetTimeZone} (${formatOffset(targetDate)}).`,
    notices: buildNotices(item, sourceZone)
  };
}

function toDateTime(component, zone) {
  const year = component.get('year');
  const month = component.get('month');
  const day = component.get('day');
  if (!year || !month || !day) return null;

  const dateTime = DateTime.fromObject({
    year,
    month,
    day,
    hour: component.get('hour') ?? 0,
    minute: component.get('minute') ?? 0,
    second: component.get('second') ?? 0
  }, { zone });
  return dateTime.isValid ? dateTime : null;
}

function detectSourceZones(text) {
  const zones = new Map();
  let remaining = text;
  const addZone = (zone, label, confidence) => {
    const existing = zones.get(zone);
    zones.set(zone, {
      zone,
      label: existing ? `${existing.label} ${label}` : label,
      confidence: existing ? Math.min(existing.confidence, confidence) : confidence
    });
  };

  remaining = remaining.replace(/\b[A-Za-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?\b/g, (iana) => {
    if (!isValidZone(iana)) return iana;
    addZone(iana, iana, 0.98);
    return ' '.repeat(iana.length);
  });

  remaining = remaining.replace(/\b(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\b/gi,
    (match, sign, hours, minutes) => {
      const offset = (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes || 0));
      addZone(FixedOffsetZone.instance(offset).name, match, 0.95);
      // Mask explicit offsets so the UTC/GMT alias is not counted a second time.
      return ' '.repeat(match.length);
    });

  for (const [pattern, zone] of ZONE_ALIASES) {
    remaining = remaining.replace(new RegExp(pattern.source, 'gi'), (match) => {
      addZone(zone, match, 0.9);
      return ' '.repeat(match.length);
    });
  }
  return [...zones.values()];
}

function normalizeZone(zone) {
  return zone === 'GMT' ? 'UTC' : zone;
}

function inferDateOnlyZone(parsed, targetTimeZone) {
  const allDateOnly = parsed.every((item) => {
    const startHasDate = item.start.get('year') && item.start.get('month') && item.start.get('day');
    const startHasTime = item.start.isCertain?.('hour') || item.start.isCertain?.('minute');
    const endHasTime = item.end && (item.end.isCertain?.('hour') || item.end.isCertain?.('minute'));
    return startHasDate && !startHasTime && !endHasTime;
  });
  return allDateOnly ? { zone: targetTimeZone, label: targetTimeZone, confidence: 0.98 } : null;
}

function isValidZone(zone) {
  return zone === 'UTC' || IANAZone.isValidZone(zone) || FixedOffsetZone.parseSpecifier(zone)?.isValid;
}

function selectChronoLocale(locale, text) {
  if (/[\u3400-\u9fff]/.test(text) && !/[A-Za-z]/.test(text) && chrono.zh?.hans) return chrono.zh.hans;
  if (/^ja/i.test(locale) && chrono.ja) return chrono.ja;
  if (/^fr/i.test(locale) && chrono.fr) return chrono.fr;
  if (/^de/i.test(locale) && chrono.de) return chrono.de;
  if (/^es/i.test(locale) && chrono.es) return chrono.es;
  return chrono;
}

function detectOutputLocale(text) {
  const hasCjk = /[\u3400-\u9fff]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  return hasCjk && !hasLatin ? 'zh' : 'en';
}

function formatDateTime(dateTime, outputLocale, hasTime) {
  if (outputLocale === 'zh') {
    return hasTime ? dateTime.toFormat('yyyy年M月d日 HH:mm') : dateTime.toFormat('yyyy年M月d日');
  }
  return hasTime ? dateTime.toFormat('MMM d, yyyy, h:mm a') : dateTime.toFormat('MMM d, yyyy');
}

function formatRange(start, end, outputLocale, hasTime) {
  if (outputLocale === 'zh') {
    return `${formatDateTime(start, 'zh', hasTime)}至${formatDateTime(end, 'zh', hasTime)}`;
  }
  return `${formatDateTime(start, 'en', hasTime)} - ${formatDateTime(end, 'en', hasTime)}`;
}

function formatOffset(dateTime) {
  const total = dateTime.offset;
  const sign = total >= 0 ? '+' : '-';
  const abs = Math.abs(total);
  const hours = String(Math.trunc(abs / 60)).padStart(2, '0');
  const minutes = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}

function buildNotices(item, sourceZone) {
  const notices = [];
  if (item.start.isCertain && !item.start.isCertain('day')) {
    notices.push('Date was inferred from the provided reference time.');
  }
  if (/\bCST\b/i.test(sourceZone.label || '')) {
    notices.push('CST is ambiguous; interpreted as Central Standard Time (UTC-06:00), not China Standard Time.');
  }
  return notices;
}
