(function () {
  const targetTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
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
          <div class="timeshift-empty-message">—</div>
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
    const critical = [...notices];

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


  function syncButton() {
    convertButton.disabled = Boolean(pending) || !input.value.trim();
    convertButton.textContent = pending ? 'Converting…' : 'Convert';
    convertButton.setAttribute('aria-busy', String(Boolean(pending)));
  }

  function invalidateRequest() {
    requestVersion += 1;
    if (pending) {
      pending = null;

    }
    renderEmptyOutput();
    syncButton();
  }

  async function convert() {
    const text = input.value.trim();
    if (!text || pending) return;
    const version = ++requestVersion;
    const request = {};
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
      });
      if (version !== requestVersion || input.value.trim() !== text) return;
      if (!response?.ok) throw new Error(response?.error || 'Conversion failed. Please try again.');
      renderResult(response.result);
    } catch (error) {
      if (version !== requestVersion || input.value.trim() !== text) return;
      renderState('error', error.message || 'This time expression could not be converted. Add an explicit date and source timezone.');
    } finally {
      if (pending === request) {
        pending = null;
        syncButton();
      }
    }
  }

  function requestParse(payload) {
    if (typeof globalThis.TimeShiftOffline?.parseLocalTime !== 'function') {
      throw new Error('The local time parser could not load. Reopen the panel and try again.');
    }
    return { ok: true, result: TimeShiftOffline.parseLocalTime(payload) };
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
    const actions = document.createElement('div');
    actions.className = 'timeshift-convert-actions';
    convertButton = document.createElement('button');
    convertButton.type = 'button';
    convertButton.className = 'timeshift-convert-button';
    convertButton.addEventListener('click', convert);
    const privacyLink = document.createElement('a');
    privacyLink.textContent = 'Privacy';
    privacyLink.href = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('privacy.html') : './privacy.html';
    privacyLink.target = '_blank';
    privacyLink.rel = 'noopener noreferrer';
    actions.append(convertButton, privacyLink);
    controls.append(actions);
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
