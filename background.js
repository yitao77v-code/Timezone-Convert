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
