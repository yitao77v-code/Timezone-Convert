import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseDeterministicTime } from './timeParser.mjs';

const PORT = Number(process.env.TIMESHIFT_PROXY_PORT || 8787);
const ENV_PATH = resolve(process.cwd(), '.env.local');
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-nano';

async function loadEnv() {
  try {
    const content = await readFile(ENV_PATH, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // Environment variables may already be provided by the shell.
  }
}

function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10000) {
        req.destroy();
        reject(new Error('Request body is too large'));
      }
    });
    req.on('end', () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON request body'));
      }
    });
    req.on('error', reject);
  });
}

function extractOutputText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        return content.text;
      }
    }
  }
  return '';
}

function schema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      candidates: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sourceText: { type: 'string' },
            sourceTimeZone: { type: 'string' },
            targetTimeZone: { type: 'string' },
            sourceDisplay: { type: 'string' },
            targetDisplay: { type: 'string' },
            confidence: { type: 'number' },
            explanation: { type: 'string' },
            notices: { type: 'array', items: { type: 'string' } }
          },
          required: [
            'sourceText',
            'sourceTimeZone',
            'targetTimeZone',
            'sourceDisplay',
            'targetDisplay',
            'confidence',
            'explanation',
            'notices'
          ]
        }
      },
      message: { type: 'string' }
    },
    required: ['candidates', 'message']
  };
}

async function parseTime(payload) {
  const userText = String(payload.text || '').trim();
  if (!userText) return { candidates: [], message: 'No input.' };

  const deterministic = parseDeterministicTime(payload);
  if (deterministic?.candidates?.length) return deterministic;

  const outputStyle = detectOutputStyle(userText);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Check .env.local or your shell environment.');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text: [
                'You extract and convert time expressions for a timezone converter.',
                'Return only structured data matching the schema.',
                'Infer ambiguous natural language dates from the provided now timestamp.',
                'Prefer IANA timezone IDs. If the source timezone is missing, infer from text only and add a notice.',
                'Use concise display strings suitable for a compact browser extension panel.',
                'Display formatting is strict. If outputStyle is zh: date-only is yyyy年M月d日, date-time is yyyy年M月d日 HH:mm, ranges use 至.',
                'If outputStyle is en: date-only is MMM d, yyyy, date-time is MMM d, yyyy, h:mm AM/PM, ranges use " - ".',
                'Mixed Chinese and English input must use outputStyle en.',
                'Apply the chosen format exactly to sourceDisplay and targetDisplay.',
                'Avoid ambiguous timezone abbreviations in explanations; use IANA IDs, full names, or UTC offsets instead.',
                'Asia/Shanghai is China Standard Time, UTC+8. Never call it CDT.'
              ].join(' ')
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                text: userText,
                targetTimeZone: payload.targetTimeZone || 'UTC',
                locale: payload.locale || 'en-US',
                outputStyle,
                now: payload.now || new Date().toISOString()
              })
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'timeshift_time_parse',
          strict: true,
          schema: schema()
        }
      },
      max_output_tokens: 1200
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI API returned ${response.status}`);
  }

  const outputText = extractOutputText(data);
  if (!outputText) throw new Error('OpenAI response did not include output text');
  return { source: 'openai', ...JSON.parse(outputText) };
}

function detectOutputStyle(text) {
  return /[\u3400-\u9fff]/.test(text) && !/[A-Za-z]/.test(text) ? 'zh' : 'en';
}

await loadEnv();

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    jsonResponse(res, 204, {});
    return;
  }
  if (req.method !== 'POST' || req.url !== '/parse-time') {
    jsonResponse(res, 404, { error: 'Not found' });
    return;
  }

  try {
    const payload = await readJson(req);
    const result = await parseTime(payload);
    jsonResponse(res, 200, result);
  } catch (error) {
    jsonResponse(res, 500, { error: error.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`TimeShift OpenAI proxy listening on http://127.0.0.1:${PORT}`);
});
