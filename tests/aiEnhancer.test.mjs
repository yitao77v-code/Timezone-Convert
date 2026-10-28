import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const enhancer = await readFile(new URL('../aiEnhancer.js', import.meta.url), 'utf8');
const parserBundle = await readFile(new URL('../offlineParser.js', import.meta.url), 'utf8');
const overrides = await readFile(new URL('../panel-overrides.css', import.meta.url), 'utf8');
const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.listeners = new Map();
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
  setAttribute(name, value) { this.attributes[name] = value; }
}

function setup() {
  const input = new Element('textarea');
  const grid = new Element('div');
  const legacyResults = new Element('section');
  legacyResults.innerHTML = 'legacy result must remain hidden';
  grid.append(legacyResults);
  const context = vm.createContext({
    document: {
      createElement: tag => new Element(tag),
      getElementById: id => id === 'time-input' ? input : null,
      querySelector: selector => ({ '.grid-container': grid, '.results-section': legacyResults })[selector]
    },
    window: { addEventListener() {} }, navigator: { language: 'en-US' },
    Intl, Date, console,
    requestAnimationFrame() { throw new Error('Fixture must be ready'); },
    fetch() { throw new Error('Offline conversion must not use the network'); },
    chrome: { runtime: {
      getURL: path => `chrome-extension://timeshift/${path}`,
      sendMessage() { throw new Error('Conversion must run entirely in the panel'); }
    } }
  });
  vm.runInContext(parserBundle, context);
  vm.runInContext(enhancer, context);
  const controls = grid.children.find(node => node.className === 'timeshift-convert-section');
  const output = grid.children.find(node => node.className === 'timeshift-ai-section');
  const button = controls.children[0].children[0];
  const type = value => { input.value = value; input.dispatch('input'); };
  return { input, button, controls, output, type };
}

test('bundled conversion works with no network and only after Convert', async () => {
  const ui = setup();
  assert.equal(ui.button.disabled, true);
  ui.type('October 27, 2026 at 3pm UTC');
  assert.match(ui.output.innerHTML, /—/);
  assert.match(ui.controls.children[0].children[1].href, /privacy\.html$/);
  ui.button.dispatch('click');
  assert.equal(ui.button.disabled, true);
  await flush();
  assert.match(ui.output.innerHTML, /Oct 27, 2026/);
  assert.match(ui.output.innerHTML, /UTC/);
  assert.equal(ui.button.disabled, false);
  assert.match(overrides, /\.results-section,\s*\.meta-section,\s*\.timeshift-ai-section\[hidden\]\s*\{\s*display: none !important;/);
});

test('editing clears the result and prevents an earlier conversion from rendering', async () => {
  const ui = setup();
  ui.type('October 27, 2026 at 3pm UTC');
  ui.button.dispatch('click');
  ui.type('October 28, 2026 at 4pm UTC');
  await flush();
  assert.match(ui.output.innerHTML, /—/);
  assert.doesNotMatch(ui.output.innerHTML, /Oct 27/);
  ui.button.dispatch('click');
  await flush();
  assert.match(ui.output.innerHTML, /Oct 28, 2026/);
  ui.type('October 29, 2026 at 5pm UTC');
  assert.match(ui.output.innerHTML, /—/);
  assert.doesNotMatch(ui.output.innerHTML, /Oct 28/);
});

test('unrecognized input explains the format instead of returning a guessed result', async () => {
  const ui = setup();
  ui.type('Call me when the game is over');
  ui.button.dispatch('click');
  await flush();
  assert.match(ui.output.innerHTML, /Could not determine a reliable time/);
  assert.match(ui.output.innerHTML, /one source timezone/);
  assert.equal(ui.button.disabled, false);
});

test('extension has no remote host permissions and blocks connection requests', () => {
  assert.equal(manifest.host_permissions, undefined);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
  assert.doesNotMatch(enhancer + background + parserBundle, /timeshift-api\.onrender\.com|parseTimeWithAI/);
});

test('toolbar click still injects the panel on supported pages', async () => {
  let clicked;
  const calls = [];
  vm.runInNewContext(background, {
    console,
    chrome: {
      action: { onClicked: { addListener(handler) { clicked = handler; } } },
      scripting: { executeScript: async value => calls.push(value) }
    }
  });
  await clicked({ id: 1, url: 'https://example.com/' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].files[0], 'contentLauncher.js');
  await clicked({ id: 2, url: 'chrome://extensions/' });
  assert.equal(calls.length, 1);
});
