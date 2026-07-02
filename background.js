chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !/^https?:|^file:/.test(tab.url)) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['contentLauncher.js']
  });
});

const LOCAL_OPENAI_PROXY = 'http://127.0.0.1:8787/parse-time';

async function parseTimeWithAI(payload) {
  const response = await fetch(LOCAL_OPENAI_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Local OpenAI proxy returned ${response.status}`);
  }
  return body;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'parseTimeWithAI') {
    parseTimeWithAI(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.action === 'injectPanel' && message.tabId) {
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      files: ['contentLauncher.js']
    }).catch((err) => {
      console.warn('Failed to inject panel:', err);
    });
  }
});
