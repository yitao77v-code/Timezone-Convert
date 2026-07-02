(() => {
  const panelId = 'localwhen-floating-panel';

  const applyPanelStyles = async (panel) => {
    panel.style.position = 'fixed';
    const savedPosition = await new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['panelPosition'], (result) => {
          resolve(result.panelPosition || null);
        });
      } else {
        resolve(null);
      }
    });
    
    if (savedPosition) {
      panel.style.left = savedPosition.left + 'px';
      panel.style.top = savedPosition.top + 'px';
      panel.style.right = 'auto';
    } else {
      panel.style.top = '60px';
      panel.style.right = '20px';
    }
    panel.style.width = '400px';
    panel.style.height = '500px';
    panel.style.background = '#ffffff';
    panel.style.border = '1px solid #e5e5e5';
    panel.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
    panel.style.zIndex = '2147483647';
    panel.style.display = 'block';
    panel.style.overflow = 'hidden';
    panel.style.borderRadius = '0';
    panel.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  };

  const existingPanel = document.getElementById('localwhen-floating-panel');
  if (existingPanel) {
    applyPanelStyles(existingPanel);
    existingPanel.style.display = 'block';
    existingPanel.style.zIndex = '2147483647';
    return;
  }

  const panel = document.createElement('div');
  panel.id = panelId;
  applyPanelStyles(panel);

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'localwhen-close') {
      const panel = document.getElementById('localwhen-floating-panel');
      if (panel) panel.remove();
    }
  });

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '✕';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.dataset.localwhenClose = 'true';
  closeButton.style.position = 'absolute';
  closeButton.style.top = '10px';
  closeButton.style.right = '10px';
  closeButton.style.zIndex = '2';
  closeButton.style.border = '0';
  closeButton.style.width = '28px';
  closeButton.style.height = '28px';
  closeButton.style.background = 'transparent';
  closeButton.style.color = '#737373';
  closeButton.style.cursor = 'pointer';
  closeButton.style.font = '500 14px "Inter", sans-serif';
  closeButton.style.padding = '0';
  closeButton.style.display = 'flex';
  closeButton.style.alignItems = 'center';
  closeButton.style.justifyContent = 'center';
  closeButton.style.transition = 'color 0.15s ease';

  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.color = '#171717';
  });

  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.color = '#737373';
  });

  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('index.html');
  iframe.setAttribute('scrolling', 'no');
  iframe.style.display = 'block';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  iframe.style.background = '#ffffff';
  iframe.style.overflow = 'hidden';

  iframe.addEventListener('load', () => {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.documentElement.style.overflow = 'hidden';
        iframeDoc.body.style.overflow = 'hidden';
        const textarea = iframeDoc.getElementById('time-input');
        if (textarea) textarea.focus();
      }
    } catch {
      // Cross-origin safety
    }
  });

  panel.append(closeButton, iframe);
  document.documentElement.appendChild(panel);

  closeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    panel.remove();
  });

  let dragState = null;

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data.type !== 'string') return;

    if (data.type === 'timeshift-drag-start') {
      const rect = panel.getBoundingClientRect();
      dragState = {
        x: data.x,
        y: data.y,
        left: rect.left,
        top: rect.top
      };
      panel.style.right = 'auto';
      return;
    }

    if (data.type === 'timeshift-drag-move' && dragState) {
      const nextLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, dragState.left + data.x - dragState.x));
      const nextTop = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, dragState.top + data.y - dragState.y));
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      return;
    }

    if (data.type === 'timeshift-drag-end' && dragState) {
      dragState = null;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const rect = panel.getBoundingClientRect();
        chrome.storage.local.set({
          panelPosition: { left: rect.left, top: rect.top }
        });
      }
    }
  });

})();
