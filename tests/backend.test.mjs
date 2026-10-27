import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const backendPath = fileURLToPath(new URL('../openai-proxy.mjs', import.meta.url));
const scratchRoot = fileURLToPath(new URL('../../', import.meta.url));
const dependencyRequire = createRequire(process.env.TIMESHIFT_TEST_DEPENDENCIES
  ? join(resolve(process.env.TIMESHIFT_TEST_DEPENDENCIES), 'package.json')
  : new URL('../package.json', import.meta.url));
const dependencies = Object.fromEntries(['chrono-node', 'luxon'].map(name => [name, dependencyRequire.resolve(name)]));
const sample = {
  candidates: [{
    sourceText: 'mock expression', sourceTimeZone: 'UTC', targetTimeZone: 'Asia/Shanghai',
    sourceDisplay: 'Nov 27, 2026, 3:00 PM', targetDisplay: 'Nov 27, 2026, 11:00 PM',
    confidence: 0.9, explanation: 'Mock conversion.', notices: []
  }],
  message: 'Mock structured response.'
};

async function startBackend(t, { model, envFile = '', apiKey = 'test-key-never-valid', mockMode = 'success' } = {}) {
  const cwd = await mkdtemp(join(scratchRoot, 'timeshift-backend-test-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'exit');
      child.kill('SIGTERM');
      await stopped;
    }
    await rm(cwd, { recursive: true, force: true });
  });
  // This is the only .env file a test child can read, and contains test values only.
  await writeFile(join(cwd, '.env.local'), envFile);
  const preloadPath = join(cwd, 'preload.mjs');
  await writeFile(preloadPath, `
import http from 'node:http';
import { registerHooks } from 'node:module';
const dependencies = ${JSON.stringify(dependencies)};
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(dependencies[specifier] || specifier, context);
}});
const originalListen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  this.once('listening', () => process.send({ type: 'ready', port: this.address().port }));
  args[1] = '127.0.0.1';
  return originalListen.apply(this, args);
};
// Every fetch is replaced: this test process cannot contact the real OpenAI API.
globalThis.fetch = async (url, options) => {
  if (url !== 'https://api.openai.com/v1/responses') throw new Error('Unexpected outbound URL in test');
  process.send({ type: 'request', url, options: { method: options.method, headers: options.headers, body: JSON.parse(options.body) } });
  if (process.env.TEST_MOCK_MODE === 'http-error') return new Response(JSON.stringify({ error: { message: 'Mock API rejection' } }), { status: 400 });
  if (process.env.TEST_MOCK_MODE === 'empty-output') return new Response(JSON.stringify({ output: [] }));
  return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: ${JSON.stringify(JSON.stringify(sample))} }] }] }));
};
`);
  const env = { PATH: process.env.PATH, PORT: '0', TEST_MOCK_MODE: mockMode };
  if (apiKey !== null) env.OPENAI_API_KEY = apiKey;
  if (model !== undefined) env.OPENAI_MODEL = model;
  child = spawn(process.execPath, ['--import', pathToFileURL(preloadPath).href, backendPath], {
    cwd, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  const requests = [];
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const port = await new Promise((resolvePort, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Backend did not start: ${output}`)), 5000);
    child.on('message', message => {
      if (message.type === 'request') requests.push(message);
      if (message.type === 'ready') { clearTimeout(timeout); resolvePort(message.port); }
    });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Backend exited ${code}: ${output}`)); });
  });
  const request = async (payload, path = '/parse-time', method = 'POST') => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {})
    });
    const body = await response.json().catch(() => null);
    return { response, body };
  };
  return { request, requests };
}

const fallbackInput = {
  text: 'The last Friday in November 2026 at fifteen hundred Tokyo time',
  targetTimeZone: 'Asia/Shanghai', locale: 'en-US', now: '2026-10-27T04:00:00.000Z'
};

function validateStrictSchema(schema, value) {
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
    assert.deepEqual(Object.keys(value).sort(), Object.keys(schema.properties).sort());
    for (const [name, childSchema] of Object.entries(schema.properties)) validateStrictSchema(childSchema, value[name]);
  } else if (schema.type === 'array') {
    assert.ok(Array.isArray(value));
    if (schema.maxItems !== undefined) assert.ok(value.length <= schema.maxItems);
    for (const item of value) validateStrictSchema(schema.items, item);
  } else {
    assert.equal(typeof value, schema.type);
  }
}

test('backend starts and sends a strict non-stored Luna request for an AI fallback', async t => {
  const server = await startBackend(t);
  const { response, body } = await server.request(fallbackInput);
  assert.equal(response.status, 200);
  assert.deepEqual(body, { source: 'openai', ...sample });
  assert.equal(server.requests.length, 1);
  const outbound = server.requests[0].options;
  assert.equal(outbound.method, 'POST');
  assert.equal(outbound.headers.Authorization, 'Bearer test-key-never-valid');
  assert.equal(outbound.body.model, 'gpt-5.6-luna');
  assert.equal(outbound.body.store, false);
  assert.deepEqual(outbound.body.reasoning, { effort: 'none' });
  const format = outbound.body.text.format;
  assert.equal(format.type, 'json_schema');
  assert.equal(format.strict, true);
  validateStrictSchema(format.schema, sample);
  assert.deepEqual(JSON.parse(outbound.body.input[1].content[0].text), { ...fallbackInput, outputStyle: 'en' });
});

test('deterministic and empty requests do not require a key or call OpenAI', async t => {
  const server = await startBackend(t, { apiKey: null });
  const local = await server.request({ text: 'July 1, 2026 at 3pm EST', targetTimeZone: 'UTC' });
  assert.equal(local.response.status, 200);
  assert.equal(local.body.source, 'deterministic');
  assert.equal(local.body.candidates[0].targetDisplay, 'Jul 1, 2026, 8:00 PM');
  const empty = await server.request({ text: '' });
  assert.equal(empty.response.status, 200);
  assert.deepEqual(empty.body.candidates, []);
  const missingKey = await server.request(fallbackInput);
  assert.equal(missingKey.response.status, 500);
  assert.match(missingKey.body.error, /OPENAI_API_KEY is missing/);
  assert.equal(server.requests.length, 0);
});

test('model and key are loaded from the isolated env file before model selection', async t => {
  const server = await startBackend(t, {
    apiKey: null,
    envFile: 'OPENAI_MODEL=test-custom-model\nOPENAI_API_KEY=test-file-key\n'
  });
  const { response } = await server.request(fallbackInput);
  assert.equal(response.status, 200);
  const outbound = server.requests[0].options;
  assert.equal(outbound.body.model, 'test-custom-model');
  assert.equal(outbound.body.store, false);
  assert.equal(outbound.body.reasoning, undefined);
  assert.equal(outbound.headers.Authorization, 'Bearer test-file-key');
});

for (const legacyModel of ['gpt-4.1-nano', 'gpt-4.1-nano-2025-04-14']) {
  test(`legacy model ${legacyModel} from env file maps to Luna`, async t => {
    const server = await startBackend(t, { envFile: `OPENAI_MODEL=${legacyModel}\n` });
    assert.equal((await server.request(fallbackInput)).response.status, 200);
    const outbound = server.requests[0].options.body;
    assert.equal(outbound.model, 'gpt-5.6-luna');
    assert.deepEqual(outbound.reasoning, { effort: 'none' });
    assert.equal(outbound.store, false);
  });
}

test('explicit process model takes precedence over the env file', async t => {
  const server = await startBackend(t, { model: 'test-process-model', envFile: 'OPENAI_MODEL=gpt-4.1-nano\n' });
  assert.equal((await server.request(fallbackInput)).response.status, 200);
  assert.equal(server.requests[0].options.body.model, 'test-process-model');
  assert.equal(server.requests[0].options.body.reasoning, undefined);
});

test('upstream rejection becomes a controlled JSON error', async t => {
  const server = await startBackend(t, { mockMode: 'http-error' });
  const { response, body } = await server.request(fallbackInput);
  assert.equal(response.status, 500);
  assert.deepEqual(body, { error: 'Mock API rejection' });
});

test('missing output text becomes a controlled JSON error', async t => {
  const server = await startBackend(t, { mockMode: 'empty-output' });
  const { response, body } = await server.request(fallbackInput);
  assert.equal(response.status, 500);
  assert.match(body.error, /did not include output text/);
});

test('preflight succeeds and unsupported paths return JSON 404', async t => {
  const server = await startBackend(t);
  const preflight = await server.request(null, '/parse-time', 'OPTIONS');
  assert.equal(preflight.response.status, 204);
  assert.equal(preflight.response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  const unsupported = await server.request(null, '/', 'GET');
  assert.equal(unsupported.response.status, 404);
  assert.deepEqual(unsupported.body, { error: 'Not found' });
  assert.equal(server.requests.length, 0);
});
