(function () {
  const sectionClass = 'timeshift-ai-section';
  const outputCardSelector = '.results-section .result-card';
  const targetTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let timer = null;
  let requestId = 0;

  function ensureSection() {
    let section = document.querySelector(`.${sectionClass}`);
    if (section) return section;

    section = document.createElement('section');
    section.className = sectionClass;
    section.style.display = 'grid';
    section.style.gap = '12px';
    section.style.marginTop = '24px';

    const results = document.querySelector('.results-section');
    if (results && results.parentElement) {
      results.parentElement.insertBefore(section, results);
    } else {
      document.body.appendChild(section);
    }
    return section;
  }

  function renderState(kind, text) {
    if (kind === 'empty') {
      const outputCard = document.querySelector(outputCardSelector);
      if (outputCard) {
        outputCard.dataset.smartState = '';
        outputCard.classList.add('result-card-placeholder');
        outputCard.innerHTML = `
          <div class="result-primary">
            <span class="section-label">Output</span>
            <div class="result-time">&nbsp;</div>
          </div>
          <div class="result-meta">
            <span class="meta-label">Target</span>
            <span class="meta-value">${escapeHtml(targetTimeZone)}</span>
          </div>
        `;
      }
      const sourceValue = document.querySelector('.meta-section .meta-value');
      if (sourceValue) sourceValue.textContent = '—';
      const section = document.querySelector(`.${sectionClass}`);
      if (section) section.replaceChildren();
      return;
    }

    const className = kind === 'error' ? 'error-message' : 'loading-indicator';
    const outputCard = document.querySelector(outputCardSelector);
    if (outputCard) {
      outputCard.classList.remove('result-card-placeholder');
      outputCard.dataset.smartState = kind;
      outputCard.innerHTML = `
        <div class="result-primary">
          <span class="section-label">Output</span>
          <div class="${className}">${escapeHtml(text)}</div>
        </div>
        <div class="result-meta">
          <span class="meta-label">Target</span>
          <span class="meta-value">${escapeHtml(targetTimeZone)}</span>
        </div>
      `;
      return;
    }

    const section = ensureSection();
    section.innerHTML = `<div class="${className}">${escapeHtml(text)}</div>`;
  }

  function renderResult(result) {
    const candidates = Array.isArray(result.candidates) ? result.candidates : [];
    if (!candidates.length) {
      renderState('error', result.message || 'AI did not find a time expression.');
      return;
    }

    updateSourceDisplay(candidates[0]);

    const outputCard = document.querySelector(outputCardSelector);
    if (outputCard) {
      outputCard.classList.remove('result-card-placeholder');
      outputCard.dataset.smartState = 'result';
      outputCard.innerHTML = candidates.map((candidate, index) => `
        ${candidates.length > 1 ? `<div class="option-marker">${String.fromCharCode(65 + index)}</div>` : ''}
        <div class="result-primary">
          <span class="section-label">Output</span>
          <div class="result-time">${escapeHtml(candidate.targetDisplay || '')}</div>
        </div>
        <div class="result-meta">
          <span class="meta-label">Source</span>
          <span class="meta-value">${escapeHtml(candidate.sourceDisplay || candidate.sourceText || 'Unknown')}</span>
        </div>
        <div class="result-meta">
          <span class="meta-label">Target</span>
          <span class="meta-value">${escapeHtml(candidate.targetTimeZone || targetTimeZone)}</span>
        </div>
        ${criticalNotices(candidate, result).map((notice) => `<div class="warning">${escapeHtml(notice)}</div>`).join('')}
      `).join('');
      return;
    }

    const section = ensureSection();
    section.innerHTML = candidates.map((candidate) => `
      <article class="result-card">
        <div class="result-primary">
          <span class="section-label">Output</span>
          <div class="result-time">${escapeHtml(candidate.targetDisplay || '')}</div>
        </div>
      </article>
    `).join('');
  }

  function updateSourceDisplay(candidate) {
    const sourceValue = document.querySelector('.meta-section .meta-value');
    if (sourceValue && candidate?.sourceTimeZone) {
      sourceValue.textContent = candidate.sourceTimeZone;
    }
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

  function parseWithAI(text) {
    const currentId = ++requestId;
    renderState('loading', 'Recognizing time expression...');

    requestParse({
      text,
      targetTimeZone,
      locale: navigator.language,
      now: new Date().toISOString()
    }).then((response) => {
      if (currentId !== requestId) return;
      if (!response || !response.ok) {
        renderState('error', response?.error || 'OpenAI recognition failed.');
        return;
      }
      renderResult(response.result);
    }).catch((error) => {
      if (currentId !== requestId) return;
      renderState('error', error.message);
    });
  }

  function requestParse(payload) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'parseTimeWithAI',
          payload
        }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response);
        });
      });
    }

    return fetch('https://timeshift-api.onrender.com/parse-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, error: body.error || `TimeShift API returned ${response.status}` };
      return { ok: true, result: body };
    });
  }

  function bind() {
    const input = document.getElementById('time-input');
    if (!input) {
      requestAnimationFrame(bind);
      return;
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const text = input.value.trim();
      if (!text) {
        requestId += 1;
        renderState('empty');
        return;
      }
      timer = setTimeout(() => parseWithAI(text), 650);
    });
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
