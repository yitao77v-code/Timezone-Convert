(function () {
  const targetTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const REQUEST_TIMEOUT_MS = 60000;
  let requestVersion = 0;
  let pending = null;
  let input;
  let convertButton;
  let cloudOutput;

  function renderEmptyOutput() {
    cloudOutput.hidden = false;
    cloudOutput.innerHTML = `
      <article class="result-card timeshift-empty-result">
        <div class="result-primary">
          <span class="section-label">Output</span>
          <div class="timeshift-empty-message">Enter a time and choose Convert.</div>
        </div>
        <div class="result-meta">
          <span class="meta-label">Target</span>
          <span class="meta-value">${escapeHtml(targetTimeZone)}</span>
        </div>
      </article>
    `;
  }

  function renderState(kind, text) {
    cloudOutput.hidden = false;
    cloudOutput.innerHTML = `<div class="${kind === 'error' ? 'error-message' : 'loading-indicator'}">${escapeHtml(text)}</div>`;
  }

  function renderResult(result) {
    const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    if (!candidates.length) {
      renderState('error', result?.message || 'No time expression found. Add a date and source timezone, then try again.');
      return;
    }
    cloudOutput.hidden = false;
    cloudOutput.innerHTML = candidates.map((candidate, index) => `
      <article class="result-card">
        ${candidates.length > 1 ? `<div class="option-marker">${String.fromCharCode(65 + index)}</div>` : ''}
        <div class="result-primary">
          <span class="section-label">Output</span>
          <div class="result-time">${escapeHtml(candidate.targetDisplay || '')}</div>
        </div>
        <div class="result-meta">
          <span class="meta-label">Source</span>
          <span class="meta-value">${escapeHtml(candidate.sourceDisplay || candidate.sourceText || 'Unknown')} · ${escapeHtml(candidate.sourceTimeZone || 'Unknown timezone')}</span>
        </div>
        <div class="result-meta">
          <span class="meta-label">Target</span>
          <span class="meta-value">${escapeHtml(candidate.targetTimeZone || targetTimeZone)}</span>
        </div>
        ${criticalNotices(candidate, result).map((notice) => `<div class="warning">${escapeHtml(notice)}</div>`).join('')}
      </article>
    `).join('');
  }

  function criticalNotices(candidate, result) {
    const notices = Array.isArray(candidate.notices) ? candidate.notices : [];
    const critical = notices.filter(isCriticalNotice);

    if (typeof candidate.confidence === 'number' && candidate.confidence > 0 && candidate.confidence < 0.7) {
      critical.push('Low confidence result. Please confirm the source time and timezone.');
    }
    if (Array.isArray(result.candidates) && result.candidates.length > 1) {
      critical.push('Multiple possible times found. Please confirm the intended option.');
    }
    if (!candidate.sourceTimeZone || /unknown/i.test(candidate.sourceTimeZone)) {
      critical.push('Source timezone is missing. Please add a timezone for reliable conversion.');
    }

    return [...new Set(critical)].slice(0, 2);
  }

  function isCriticalNotice(notice) {
    return /missing|ambiguous|uncertain|low confidence|confirm|failed|error|invalid|cannot|unable|timezone.*missing|source timezone|multiple possible/i.test(notice);
  }

  function syncButton() {
    convertButton.disabled = Boolean(pending) || !input.value.trim();
    convertButton.textContent = pending ? 'Converting…' : 'Convert';
    convertButton.setAttribute('aria-busy', String(Boolean(pending)));
  }

  function invalidateRequest() {
    requestVersion += 1;
    if (pending) {
      const previous = pending;
      pending = null;
      clearTimeout(previous.timeout);
      previous.controller.abort('input-changed');
    }
    renderEmptyOutput();
    syncButton();
  }

  async function convert() {
    const text = input.value.trim();
    if (!text || pending) return;
    const version = ++requestVersion;
    const controller = new AbortController();
    const request = {
      id: `${Date.now()}-${version}`,
      controller,
      timeout: setTimeout(() => controller.abort('timeout'), REQUEST_TIMEOUT_MS)
    };
    pending = request;
    renderEmptyOutput();
    syncButton();
    renderState('loading', 'Converting time expression…');

    try {
      const response = await requestParse({
        text,
        targetTimeZone,
        locale: navigator.language,
        now: new Date().toISOString()
      }, request.id, controller.signal);
      if (version !== requestVersion || input.value.trim() !== text) return;
      if (!response?.ok) throw new Error(response?.error || 'Conversion failed. Please try again.');
      renderResult(response.result);
    } catch (error) {
      if (version !== requestVersion || input.value.trim() !== text) return;
      const message = controller.signal.aborted && controller.signal.reason === 'timeout'
        ? 'The service took too long. Please try Convert again.'
        : error.message;
      renderState('error', message);
    } finally {
      clearTimeout(request.timeout);
      if (pending === request) {
        pending = null;
        syncButton();
      }
    }
  }

  function requestParse(payload, requestId, signal) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (value, error) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', cancel);
          if (error) reject(error);
          else resolve(value);
        };
        const cancel = () => {
          chrome.runtime.sendMessage({ action: 'cancelTimeParse', requestId }, () => {
            // Reading lastError prevents an unchecked error if the worker has stopped.
            void chrome.runtime.lastError;
          });
          finish(null, new Error('Conversion cancelled.'));
        };
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) {
          cancel();
          return;
        }
        chrome.runtime.sendMessage({ action: 'parseTimeWithAI', requestId, payload }, (response) => {
          const error = chrome.runtime.lastError;
          finish(response, error ? new Error(error.message) : null);
        });
      });
    }

    return fetch('https://timeshift-api.onrender.com/parse-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, error: body.error || `TimeShift API returned ${response.status}` };
      return { ok: true, result: body };
    });
  }

  function bind() {
    input = document.getElementById('time-input');
    const grid = document.querySelector('.grid-container');
    const results = document.querySelector('.results-section');
    if (!input || !grid || !results) {
      requestAnimationFrame(bind);
      return;
    }

    // Keep these nodes separate from React-owned result cards.
    const controls = document.createElement('section');
    controls.className = 'timeshift-convert-section';
    const disclosure = document.createElement('p');
    disclosure.id = 'timeshift-data-disclosure';
    disclosure.className = 'timeshift-data-disclosure';
    disclosure.textContent = 'Convert sends the full input, target timezone, browser language and current time to TimeShift’s backend on Render. Ambiguous text may be processed by OpenAI. Text is only sent when you choose Convert.';

    const actions = document.createElement('div');
    actions.className = 'timeshift-convert-actions';
    convertButton = document.createElement('button');
    convertButton.type = 'button';
    convertButton.className = 'timeshift-convert-button';
    convertButton.setAttribute('aria-describedby', disclosure.id);
    convertButton.addEventListener('click', convert);
    const privacyLink = document.createElement('a');
    privacyLink.textContent = 'Privacy';
    privacyLink.href = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('privacy.html') : './privacy.html';
    privacyLink.target = '_blank';
    privacyLink.rel = 'noopener noreferrer';
    actions.append(convertButton, privacyLink);
    controls.append(disclosure, actions);
    grid.insertBefore(controls, results);

    cloudOutput = document.createElement('section');
    cloudOutput.className = 'timeshift-ai-section';
    cloudOutput.setAttribute('aria-live', 'polite');
    cloudOutput.setAttribute('aria-label', 'Conversion result');
    cloudOutput.hidden = true;
    grid.insertBefore(cloudOutput, results);
    input.addEventListener('input', invalidateRequest);
    window.addEventListener('pagehide', invalidateRequest);
    renderEmptyOutput();
    syncButton();
  }

  window.addEventListener('pointerdown', (event) => {
    if (!isDragGutterEvent(event)) return;
    window.parent.postMessage({ type: 'timeshift-drag-start', x: event.screenX, y: event.screenY }, '*');
  });

  window.addEventListener('pointermove', (event) => {
    if ((event.buttons & 1) !== 1) return;
    window.parent.postMessage({ type: 'timeshift-drag-move', x: event.screenX, y: event.screenY }, '*');
  });

  window.addEventListener('pointerup', () => {
    window.parent.postMessage({ type: 'timeshift-drag-end' }, '*');
  });

  function isDragGutterEvent(event) {
    if (event.target.closest?.('textarea, input, button, a, select, [role="button"]')) return false;
    const gutter = 28;
    return event.clientX < gutter ||
      event.clientY < gutter ||
      window.innerWidth - event.clientX < gutter ||
      window.innerHeight - event.clientY < gutter;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  bind();
})();
