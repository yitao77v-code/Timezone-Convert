import { parseDeterministicTime } from './timeParser.mjs';

export function parseLocalTime(payload = {}) {
  const text = String(payload.text || '').trim();
  if (text.length > 10000) {
    return { source: 'deterministic', candidates: [], message: 'Please convert a shorter passage (up to 10,000 characters).' };
  }
  try {
    const result = parseDeterministicTime({ ...payload, text });
    if (result) return result;
  } catch {
    // Unsupported syntax is reported to the user; there is no remote fallback.
  }
  return {
    source: 'deterministic',
    candidates: [],
    message: 'Could not determine a reliable time. Use one source timezone and an explicit date, for example “October 27, 2026 at 3pm UTC”. Ambiguous daylight-saving times need a UTC offset.'
  };
}
