(function () {
  'use strict';

  const { evaluate, formatNumber, CalcError } = window.Calc;

  const STORAGE_KEY = 'scientific-calculator-v1';
  const MAX_HISTORY = 40;
  const BINARY_OPS = ['+', '-', '−', '*', '×', '/', '÷', '^'];

  const state = {
    expr: '',
    historyLine: '',
    ans: 0,
    memory: 0,
    angle: 'DEG',
    second: false,
    justEvaluated: false,
    error: '',
    history: []
  };

  const shell = document.getElementById('shell');
  const exprLine = document.getElementById('expr-line');
  const historyLine = document.getElementById('history-line');
  const previewLine = document.getElementById('preview-line');
  const memoryBadge = document.getElementById('memory-badge');
  const angleToggle = document.getElementById('angle-toggle');
  const keypad = document.getElementById('keypad');
  const secondKey = document.getElementById('second-key');
  const historyToggle = document.getElementById('history-toggle');
  const historyPanel = document.getElementById('history-panel');
  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');
  const historyBackdrop = document.getElementById('history-backdrop');
  const clearHistoryBtn = document.getElementById('clear-history');

  const keyMap = new Map();

  function context() {
    return { angle: state.angle, ans: state.ans, memory: state.memory };
  }

  function isMobile() {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function updateBadges() {
    const hasMemory = state.memory !== 0;
    memoryBadge.classList.toggle('is-visible', hasMemory);
    memoryBadge.setAttribute('aria-hidden', String(!hasMemory));
    memoryBadge.title = hasMemory ? `Memory: ${formatNumber(state.memory)}` : 'Memory empty';

    angleToggle.textContent = state.angle;
    angleToggle.setAttribute(
      'aria-label',
      `Angle unit: ${state.angle === 'DEG' ? 'degrees' : 'radians'}. Click to switch.`
    );
  }

  function render() {
    exprLine.textContent = state.expr || '0';
    exprLine.classList.toggle('is-placeholder', !state.expr);

    historyLine.textContent = state.historyLine;
    historyLine.classList.toggle('is-visible', Boolean(state.historyLine));

    previewLine.classList.remove('is-error');
    previewLine.textContent = '';

    if (state.error) {
      previewLine.textContent = state.error;
      previewLine.classList.add('is-error');
      previewLine.classList.add('is-visible');
      if (!exprLine.classList.contains('is-error')) {
        exprLine.classList.remove('is-error');
        void exprLine.offsetWidth;
        exprLine.classList.add('is-error');
      }
    } else {
      exprLine.classList.remove('is-error');
      if (state.expr && !state.justEvaluated) {
        try {
          const value = evaluate(state.expr, context());
          const formatted = formatNumber(value);
          const comparable = state.expr.replace(/−/g, '-');
          if (Number.isFinite(value) && formatted !== comparable) {
            previewLine.textContent = `= ${formatted}`;
          }
        } catch (error) {
          // Incomplete expressions are expected while typing.
        }
      }
      previewLine.classList.toggle('is-visible', Boolean(previewLine.textContent));
    }

    exprLine.scrollLeft = exprLine.scrollWidth;
    updateBadges();
  }

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ history: state.history, angle: state.angle, memory: state.memory })
      );
    } catch (error) {
      // Storage is optional (private mode, file protocol, etc.).
    }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.history)) {
        state.history = data.history
          .filter(
            (item) =>
              item &&
              typeof item.expr === 'string' &&
              typeof item.result === 'string' &&
              item.expr.length < 200 &&
              item.result.length < 200
          )
          .slice(0, MAX_HISTORY);
      }
      if (data.angle === 'DEG' || data.angle === 'RAD') state.angle = data.angle;
      if (typeof data.memory === 'number' && Number.isFinite(data.memory)) state.memory = data.memory;
    } catch (error) {
      // Ignore corrupted storage.
    }
  }

  function insert(rawToken) {
    let token = rawToken;
    state.error = '';

    if (state.justEvaluated) {
      const continues = /^[+\-−*×/÷^%!]/.test(token);
      if (!continues) state.expr = '';
      state.justEvaluated = false;
      state.historyLine = '';
    }

    const lastChar = state.expr.slice(-1);

    if (BINARY_OPS.includes(token) && BINARY_OPS.includes(lastChar)) {
      const isNegativeExponent = (token === '-' || token === '−') && lastChar === '^';
      if (!isNegativeExponent) state.expr = state.expr.slice(0, -1);
    }

    if (token === ')') {
      const opens = (state.expr.match(/\(/g) || []).length;
      const closes = (state.expr.match(/\)/g) || []).length;
      if (opens <= closes) return;
    }

    if (token === '.') {
      if (/e[+-]?\d+$/i.test(state.expr)) return;
      const tail = (state.expr.match(/[0-9.]*$/) || [''])[0];
      if (tail.includes('.')) return;
      if (state.expr === '' || !/[0-9.]$/.test(state.expr)) token = '0.';
    }

    if (state.expr === '' && /^[+*/×÷^%!]/.test(token)) return;

    state.expr += token;
    render();
  }

  function backspace() {
    state.error = '';
    if (!state.expr) return;

    const functionMatch = state.expr.match(
      /(asinh|acosh|atanh|asin|acos|atan|sinh|cosh|tanh|sqrt|cbrt|log2|log|ln|abs|exp|inv)\($/
    );

    if (functionMatch) {
      state.expr = state.expr.slice(0, -functionMatch[0].length);
    } else {
      state.expr = state.expr.slice(0, -1);
    }

    state.justEvaluated = false;
    state.historyLine = '';
    render();
  }

  function clearAll() {
    state.expr = '';
    state.historyLine = '';
    state.error = '';
    state.justEvaluated = false;
    render();
  }

  function evaluateAndCommit() {
    if (state.justEvaluated) return;

    const expression = state.expr.trim();
    if (!expression) return;

    state.error = '';
    try {
      const value = evaluate(expression, context());
      if (!Number.isFinite(value)) throw new CalcError('Result is undefined');

      const formatted = formatNumber(value);
      state.ans = value;
      state.historyLine = `${expression} =`;
      state.expr = formatted;
      state.justEvaluated = true;
      addHistory(expression, formatted);
    } catch (error) {
      state.error = error instanceof CalcError ? error.message : 'Invalid expression';
    }
    render();
  }

  function toggleSign() {
    state.error = '';

    if (state.justEvaluated) {
      state.ans = -state.ans;
      state.expr = formatNumber(state.ans);
      state.justEvaluated = false;
      state.historyLine = '';
      render();
      return;
    }

    if (!state.expr) {
      state.expr = '−';
      render();
      return;
    }

    if (state.expr === '−' || state.expr === '-') {
      state.expr = '';
      render();
      return;
    }

    const match = state.expr.match(/(\d+\.?\d*(?:e[+-]?\d+)?)$/i);
    if (!match) {
      state.expr = `−(${state.expr})`;
      render();
      return;
    }

    const start = state.expr.length - match[1].length;
    const before = state.expr.slice(0, start);
    const endsWithMinus = before.endsWith('-') || before.endsWith('−');

    if (endsWithMinus) {
      const prior = before.slice(0, -1);
      if (prior === '' || /[+\-−*×/÷^(]$/.test(prior)) {
        state.expr = prior + match[1];
      } else {
        state.expr = `${before}−${match[1]}`;
      }
    } else {
      state.expr = `${before}−${match[1]}`;
    }

    render();
  }

  function currentValue() {
    if (state.justEvaluated) return state.ans;
    const expression = state.expr.trim();
    if (!expression) return 0;
    try {
      return evaluate(expression, context());
    } catch (error) {
      return null;
    }
  }

  function memoryAction(kind) {
    state.error = '';

    if (kind === 'clear') {
      state.memory = 0;
      persist();
      render();
      return;
    }

    if (kind === 'recall') {
      insert(formatNumber(state.memory));
      return;
    }

    const value = currentValue();
    if (value === null || !Number.isFinite(value)) {
      state.error = 'Nothing to store';
      render();
      return;
    }

    state.memory += kind === 'sub' ? -value : value;
    if (Math.abs(state.memory) < 1e-12) state.memory = 0;

    memoryBadge.classList.remove('is-flash');
    void memoryBadge.offsetWidth;
    memoryBadge.classList.add('is-flash');

    persist();
    render();
  }

  function toggleSecond() {
    state.second = !state.second;
    document.querySelectorAll('[data-alt-value]').forEach((button) => {
      button.textContent = state.second ? button.dataset.altLabel : button.dataset.label;
    });
    secondKey.classList.toggle('is-active', state.second);
    secondKey.setAttribute('aria-pressed', String(state.second));
  }

  function toggleAngle() {
    state.angle = state.angle === 'DEG' ? 'RAD' : 'DEG';
    state.error = '';
    persist();
    render();
  }

  function buildKeyMap() {
    keyMap.clear();
    document.querySelectorAll('.key').forEach((button) => {
      if (button.dataset.value) keyMap.set(`value:${button.dataset.value}`, button);
      if (button.dataset.action) keyMap.set(`action:${button.dataset.action}`, button);
    });
  }

  function flash(key) {
    const button = keyMap.get(key);
    if (!button) return;
    button.classList.add('is-pressed');
    window.setTimeout(() => button.classList.remove('is-pressed'), 120);
  }

  function handleAction(action) {
    switch (action) {
      case 'equals':
        evaluateAndCommit();
        break;
      case 'clear':
        clearAll();
        break;
      case 'backspace':
        backspace();
        break;
      case 'sign':
        toggleSign();
        break;
      case 'second':
        toggleSecond();
        break;
      case 'memory-clear':
        memoryAction('clear');
        break;
      case 'memory-recall':
        memoryAction('recall');
        break;
      case 'memory-add':
        memoryAction('add');
        break;
      case 'memory-sub':
        memoryAction('sub');
        break;
      default:
        break;
    }
  }

  function buildHistoryItem(item) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history__item';
    button.dataset.result = item.result;
    button.title = `Insert ${item.result}`;
    button.setAttribute('aria-label', `${item.expr} equals ${item.result}. Insert result.`);

    const expr = document.createElement('span');
    expr.className = 'history__expr';
    expr.textContent = item.expr;

    const result = document.createElement('span');
    result.className = 'history__result';
    result.textContent = `= ${item.result}`;

    button.append(expr, result);
    li.append(button);
    return li;
  }

  function renderHistory() {
    historyList.replaceChildren();
    const hasItems = state.history.length > 0;
    historyEmpty.hidden = hasItems;
    historyList.hidden = !hasItems;

    if (!hasItems) return;

    const fragment = document.createDocumentFragment();
    state.history.forEach((item) => fragment.append(buildHistoryItem(item)));
    historyList.append(fragment);
  }

  function addHistory(expression, result) {
    state.history.unshift({ expr: expression, result });
    if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
    persist();
    renderHistory();
  }

  function closeHistory() {
    historyPanel.classList.remove('is-open');
    historyBackdrop.classList.remove('is-open');
    historyToggle.classList.remove('is-active');
    document.body.classList.remove('drawer-open');
    historyToggle.setAttribute('aria-expanded', 'false');
    historyPanel.setAttribute('aria-hidden', 'true');
    if (isMobile()) historyPanel.inert = true;
  }

  function toggleHistory() {
    if (isMobile()) {
      const open = historyPanel.classList.toggle('is-open');
      historyBackdrop.classList.toggle('is-open', open);
      historyToggle.classList.toggle('is-active', open);
      document.body.classList.toggle('drawer-open', open);
      historyToggle.setAttribute('aria-expanded', String(open));
      historyPanel.setAttribute('aria-hidden', String(!open));
      historyPanel.inert = !open;
    } else {
      const collapsed = shell.classList.toggle('history-collapsed');
      historyToggle.classList.toggle('is-active', !collapsed);
      historyToggle.setAttribute('aria-expanded', String(!collapsed));
    }
  }

  function handleKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key;
    const target = event.target;
    if ((key === 'Enter' || key === ' ') && target && target.closest && target.closest('button')) {
      return;
    }

    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      insert(key);
      flash(`value:${key}`);
      return;
    }

    if (key === '.' || key === ',') {
      event.preventDefault();
      insert('.');
      flash('value:.');
      return;
    }

    const symbolMap = {
      '+': '+',
      '-': '−',
      '*': '×',
      '/': '÷',
      '^': '^',
      '(': '(',
      ')': ')',
      '%': '%',
      '!': '!'
    };

    if (Object.prototype.hasOwnProperty.call(symbolMap, key)) {
      event.preventDefault();
      const value = symbolMap[key];
      insert(value);
      flash(`value:${value}`);
      return;
    }

    if (key === 'Enter' || key === '=') {
      event.preventDefault();
      evaluateAndCommit();
      flash('action:equals');
      return;
    }

    if (key === 'Backspace') {
      event.preventDefault();
      backspace();
      flash('action:backspace');
      return;
    }

    if (key === 'Escape') {
      event.preventDefault();
      if (isMobile() && historyPanel.classList.contains('is-open')) {
        closeHistory();
      } else {
        clearAll();
      }
      return;
    }

    if (key.toLowerCase() === 'p') {
      event.preventDefault();
      insert('pi');
      return;
    }

    if (key.toLowerCase() === 'e') {
      event.preventDefault();
      insert('e');
    }
  }

  function bindEvents() {
    keypad.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;

      if (button.dataset.action) {
        handleAction(button.dataset.action);
      } else if (button.dataset.value) {
        const value =
          state.second && button.dataset.altValue ? button.dataset.altValue : button.dataset.value;
        insert(value);
      }

      if (event.detail !== 0) button.blur();
    });

    angleToggle.addEventListener('click', toggleAngle);
    historyToggle.addEventListener('click', toggleHistory);
    clearHistoryBtn.addEventListener('click', () => {
      state.history = [];
      persist();
      renderHistory();
    });

    historyList.addEventListener('click', (event) => {
      const item = event.target.closest('.history__item');
      if (!item) return;
      state.expr = '';
      state.historyLine = '';
      state.justEvaluated = false;
      insert(item.dataset.result);
      if (isMobile()) closeHistory();
    });

    historyBackdrop.addEventListener('click', closeHistory);

    document.addEventListener('keydown', handleKeydown);

    window.addEventListener('resize', () => {
      if (!isMobile()) {
        if (historyPanel.classList.contains('is-open')) closeHistory();
        historyPanel.inert = false;
      } else if (!historyPanel.classList.contains('is-open')) {
        historyPanel.inert = true;
      }
    });
  }

  function init() {
    restore();

    document.querySelectorAll('[data-alt-value]').forEach((button) => {
      button.dataset.label = button.textContent;
    });

    buildKeyMap();
    bindEvents();

    if (isMobile()) {
      historyPanel.setAttribute('aria-hidden', 'true');
      historyToggle.setAttribute('aria-expanded', 'false');
      historyPanel.inert = true;
    } else {
      historyPanel.removeAttribute('aria-hidden');
      historyPanel.inert = false;
      historyToggle.classList.add('is-active');
    }

    if (state.second) toggleSecond();
    renderHistory();
    render();
  }

  init();
})();
