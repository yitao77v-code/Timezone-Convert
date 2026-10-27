chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !/^https?:|^file:/.test(tab.url)) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['contentLauncher.js']
    });
  } catch (error) {
    console.warn('TimeShift cannot open on this page:', error.message);
  }
});

const TIMESHIFT_API = 'https://timeshift-api.onrender.com/parse-time';
const activeRequests = new Map();

function requestKey(sender, requestId) {
  return `${sender.documentId || `${sender.tab?.id ?? 'extension'}:${sender.frameId ?? 0}`}:${requestId}`;
}

async function parseTimeWithAI(payload, key) {
  const controller = new AbortController();
  activeRequests.get(key)?.abort();
  activeRequests.set(key, controller);
  const timeout = setTimeout(() => controller.abort('timeout'), 55000);
  try {
    const response = await fetch(TIMESHIFT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `TimeShift API returned ${response.status}`);
    return body;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(controller.signal.reason === 'timeout'
        ? 'The service took too long. Please try Convert again.'
        : 'Conversion cancelled.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (activeRequests.get(key) === controller) activeRequests.delete(key);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  if (message.action === 'cancelTimeParse' && typeof message.requestId === 'string') {
    activeRequests.get(requestKey(sender, message.requestId))?.abort('input-changed');
    sendResponse({ ok: true });
    return;
  }

  if (message.action === 'parseTimeWithAI') {
    if (typeof message.requestId !== 'string' || typeof message.payload?.text !== 'string') {
      sendResponse({ ok: false, error: 'Invalid conversion request.' });
      return;
    }
    parseTimeWithAI(message.payload, requestKey(sender, message.requestId))
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.action === 'injectPanel' && message.tabId) {
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      files: ['contentLauncher.js']
    }).catch((error) => console.warn('Failed to inject panel:', error.message));
  }
});
