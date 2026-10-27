import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const enhancer = await readFile(new URL('../aiEnhancer.js', import.meta.url), 'utf8');
const overrides = await readFile(new URL('../panel-overrides.css', import.meta.url), 'utf8');
const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
    this.attributes = {};
    this.value = '';
    this.innerHTML = '';
    this.hidden = false;
    this.disabled = false;
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  dispatch(type) { return this.listeners.get(type)?.({ target: this }); }
  append(...children) { this.children.push(...children); }
  insertBefore(child, reference) { this.children.splice(this.children.indexOf(reference), 0, child); }
  replaceChildren() { this.children = []; this.innerHTML = ''; }
  setAttribute(name, value) { this.attributes[name] = value; }
}

function setup({ extension = true } = {}) {
  const input = new Element('textarea');
  const grid = new Element('div');
  const localResults = new Element('section');
  localResults.innerHTML = 'legacy result must remain hidden';
  grid.append(localResults);
  const body = new Element('body');
  const messages = [];
  const fetches = [];
  const timers = new Map();
  let timerId = 0;
  const document = {
    body,
    createElement: tag => new Element(tag),
    getElementById: id => id === 'time-input' ? input : null,
    querySelector: selector => ({ '.grid-container': grid, '.results-section': localResults })[selector]
  };
  const context = {
    document, window: { addEventListener() {} }, navigator: { language: 'en-US' },
    Intl, Date, AbortController, console,
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame() { throw new Error('Fixture must be ready at load time'); },
    fetch(url, options) {
      return new Promise((resolve, reject) => {
        fetches.push({ url, options, resolve, reject });
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
  };
  if (extension) context.chrome = {
    runtime: {
      getURL: path => `chrome-extension://timeshift/${path}`,
      sendMessage(message, callback) {
        messages.push({ message, callback });
        if (message.action === 'cancelTimeParse') callback({ ok: true });
      }
    }
  };
  vm.runInNewContext(enhancer, context);
  const controls = grid.children.find(node => node.className === 'timeshift-convert-section');
  const output = grid.children.find(node => node.className === 'timeshift-ai-section');
  const button = controls.children[1].children[0];
  const type = value => { input.value = value; input.dispatch('input'); };
  const parseRequests = () => messages.filter(entry => entry.message.action === 'parseTimeWithAI');
  return { input, body, button, controls, output, localResults, messages, fetches, timers, type, parseRequests };
}

const answer = text => ({ ok: true, result: { candidates: [{ targetDisplay: text, sourceTimeZone: 'UTC', targetTimeZone: 'Asia/Shanghai' }] } });

test('typing never sends text; a disclosed Convert click sends one request, including double clicks', async () => {
  const ui = setup();
  assert.equal(ui.button.disabled, true);
  ui.type('tomorrow 3pm Pacific time');
  await flush();
  assert.equal(ui.parseRequests().length, 0);
  assert.equal(ui.fetches.length, 0);
  assert.equal(ui.timers.size, 0, 'typing must not schedule a later transmission');
  assert.match(ui.controls.children[0].textContent, /full input.*target timezone.*browser language.*current time.*Render.*OpenAI/);
  assert.match(ui.controls.children[1].children[1].href, /privacy\.html$/);
  assert.match(ui.controls.children[0].textContent, /Text is only sent when you choose Convert\./);
  assert.match(ui.output.innerHTML, /Enter a time and choose Convert/);
  assert.doesNotMatch(ui.output.innerHTML, /legacy result/);
  assert.match(overrides, /\.results-section,\s*\.meta-section,\s*\.timeshift-ai-section\[hidden\]\s*\{\s*display: none !important;/);
  ui.button.dispatch('click');
  ui.button.dispatch('click');
  assert.equal(ui.parseRequests().length, 1);
  assert.equal(ui.parseRequests()[0].message.payload.text, 'tomorrow 3pm Pacific time');
  assert.equal(ui.button.disabled, true);
  ui.parseRequests()[0].callback(answer('Converted result'));
  await flush();
  assert.match(ui.output.innerHTML, /Converted result/);
  assert.equal(ui.button.disabled, false);
});

test('every subsequent edit cancels the request without sending new text; stale callbacks cannot overwrite', async () => {
  const ui = setup();
  ui.type('Monday 3pm UTC');
  ui.button.dispatch('click');
  const oldRequest = ui.parseRequests()[0];
  ui.type('Tuesday 4pm UTC');
  assert.equal(ui.parseRequests().length, 1);
  assert.equal(ui.messages.at(-1).message.action, 'cancelTimeParse');
  assert.equal(ui.messages.at(-1).message.requestId, oldRequest.message.requestId);
  assert.equal(ui.output.hidden, false);
  assert.match(ui.output.innerHTML, /Enter a time and choose Convert/);
  ui.button.dispatch('click');
  const currentRequest = ui.parseRequests()[1];
  currentRequest.callback(answer('Tuesday result'));
  await flush();
  oldRequest.callback(answer('Stale Monday result'));
  await flush();
  assert.match(ui.output.innerHTML, /Tuesday result/);
  assert.doesNotMatch(ui.output.innerHTML, /Stale Monday/);
  ui.type('Wednesday 5pm UTC');
  await flush();
  assert.equal(ui.parseRequests().length, 2, 'editing after success must not send');
  assert.equal(ui.output.hidden, false);
  assert.match(ui.output.innerHTML, /Enter a time and choose Convert/);
  assert.doesNotMatch(ui.output.innerHTML, /legacy result/);
  assert.match(overrides, /\.results-section,\s*\.meta-section,\s*\.timeshift-ai-section\[hidden\]\s*\{\s*display: none !important;/);
});

test('timeout releases the button without showing legacy results and ignores late responses', async () => {
  const ui = setup();
  ui.type('tomorrow 3pm');
  ui.button.dispatch('click');
  const request = ui.parseRequests()[0];
  [...ui.timers.values()][0]();
  await flush();
  assert.equal(ui.button.disabled, false);
  assert.match(ui.output.innerHTML, /took too long/);
  assert.doesNotMatch(ui.output.innerHTML, /local results/i);
  assert.doesNotMatch(ui.output.innerHTML, /legacy result/);
  assert.match(overrides, /\.results-section,\s*\.meta-section,\s*\.timeshift-ai-section\[hidden\]\s*\{\s*display: none !important;/);
  request.callback(answer('Late result'));
  await flush();
  assert.doesNotMatch(ui.output.innerHTML, /Late result/);
});

test('web preview also requires a click and aborts its fetch when input changes', async () => {
  const ui = setup({ extension: false });
  ui.type('3pm UTC');
  assert.equal(ui.fetches.length, 0);
  ui.button.dispatch('click');
  assert.equal(ui.fetches.length, 1);
  const request = ui.fetches[0];
  assert.equal(JSON.parse(request.options.body).text, '3pm UTC');
  ui.type('4pm UTC');
  await flush();
  assert.equal(request.options.signal.aborted, true);
  assert.equal(ui.fetches.length, 1);
  assert.equal(ui.output.hidden, false);
  assert.match(ui.output.innerHTML, /Enter a time and choose Convert/);
});

test('background cancellation aborts only the matching document and request', async () => {
  let onMessage;
  const fetches = [];
  const responses = [];
  const context = {
    console, AbortController, setTimeout, clearTimeout,
    chrome: {
      action: { onClicked: { addListener() {} } },
      runtime: { onMessage: { addListener(handler) { onMessage = handler; } } },
      scripting: { executeScript: async () => {} }
    },
    fetch(url, options) {
      return new Promise((resolve, reject) => {
        fetches.push({ url, options, resolve });
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
  };
  vm.runInNewContext(background, context);
  const payload = { action: 'parseTimeWithAI', requestId: 'request-1', payload: { text: '3pm UTC' } };
  onMessage(payload, { documentId: 'doc-a' }, response => responses.push(response));
  onMessage(payload, { documentId: 'doc-b' }, response => responses.push(response));
  onMessage({ action: 'cancelTimeParse', requestId: 'request-1' }, { documentId: 'doc-a' }, () => {});
  assert.equal(fetches[0].options.signal.aborted, true);
  assert.equal(fetches[1].options.signal.aborted, false);
  fetches[1].resolve({ ok: true, json: async () => ({ candidates: [] }) });
  await flush();
  assert.equal(responses.length, 2);
  assert.equal(responses.filter(response => response.ok).length, 1);
});
