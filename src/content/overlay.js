// 双语字幕叠加层：中英两行独立定位、可拖动（可锁定防误拖）、原文单词可点击查词
const SubtitleOverlay = (() => {
  const HOLD_MAX = 1200; // 译文最长等待时间，超时先出原文
  const WORD_RE = /^[A-Za-z][A-Za-z'-]*$/;
  const DRAG_THRESHOLD = 4; // px，超过视为拖动而非点击
  const MIN_FONT = 10;
  const MAX_FONT = 64;
  const DEFAULT_POSITIONS = {
    zh: { x: 50, y: 87 },
    en: { x: 50, y: 80 },
  };

  const state = {
    settings: {
      enabled: true,
      showOriginal: true,
      enFontSize: 22,
      zhFontSize: 16,
      locked: true,
      subPositions: null,
    },
    positions: {
      zh: { ...DEFAULT_POSITIONS.zh },
      en: { ...DEFAULT_POSITIONS.en },
    },
    currentText: '',
    seq: 0,
    holdTimer: null,
    mounted: false,
    translate: null,
    onWordLookup: null,
    onPersist: null,
    suppressClick: false,
  };

  let root = null;
  let zhLine = null;
  let enLine = null;
  let notice = null;
  let lockBtn = null;
  let pop = null;
  let popWord = null;
  let docHooksInstalled = false;

  function getPlayerEl() {
    return (
      document.getElementById('movie_player') ||
      document.querySelector('ytd-player #movie_player') ||
      document.querySelector('#player-container-inner video')?.parentElement
    );
  }

  function persist(partial) {
    if (state.onPersist) state.onPersist(partial);
  }

  // ---------- 查词卡片 ----------

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.className = 'yt-bisub-pop';
    pop.hidden = true;
    root.appendChild(pop);
    return pop;
  }

  function closePop() {
    popWord = null;
    if (pop) pop.hidden = true;
  }

  function positionPop(span) {
    const rootRect = root.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    let left = spanRect.left - rootRect.left + spanRect.width / 2 - popRect.width / 2;
    left = Math.max(0, Math.min(left, rootRect.width - popRect.width));
    let top = spanRect.top - rootRect.top - popRect.height - 8;
    if (top < 0) top = spanRect.bottom - rootRect.top + 8;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  async function showWord(word, span) {
    ensurePop();
    popWord = word;
    pop.hidden = false;

    const title = document.createElement('div');
    title.className = 'yt-bisub-pop-word';
    title.textContent = word;
    const body = document.createElement('div');
    body.className = 'yt-bisub-pop-body';
    body.textContent = '查询中…';
    pop.textContent = '';
    pop.append(title, body);
    positionPop(span);

    let result = null;
    let failed = false;
    try {
      result = state.onWordLookup ? await state.onWordLookup(word) : null;
    } catch {
      failed = true;
    }
    if (popWord !== word) return;
    body.textContent = '';
    if (failed) {
      body.textContent = '查询失败，请重试';
      return;
    }
    if (!result || (!result.usphone && !result.defs.length)) {
      body.textContent = '未找到释义';
      return;
    }
    const phones = [];
    if (result.usphone) phones.push('美 ' + result.usphone);
    if (result.ukphone) phones.push('英 ' + result.ukphone);
    if (phones.length) {
      const phone = document.createElement('div');
      phone.className = 'yt-bisub-pop-phone';
      phone.textContent = phones.join('　');
      body.appendChild(phone);
    }
    for (const def of result.defs) {
      const line = document.createElement('div');
      line.className = 'yt-bisub-pop-def';
      line.textContent = def;
      body.appendChild(line);
    }
  }

  function installDocHooks() {
    if (docHooksInstalled) return;
    docHooksInstalled = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePop();
    });
    document.addEventListener('click', (e) => {
      if (!pop || pop.hidden) return;
      const t = e.target;
      if (pop.contains(t)) return;
      if (t && t.classList && t.classList.contains('yt-bisub-word')) return;
      closePop();
    });
  }

  // ---------- 拖动 ----------

  function applyPositions() {
    if (!root) return;
    zhLine.style.left = state.positions.zh.x + '%';
    zhLine.style.top = state.positions.zh.y + '%';
    enLine.style.left = state.positions.en.x + '%';
    enLine.style.top = state.positions.en.y + '%';
  }

  function makeDraggable(lineEl, which) {
    let dragging = false;
    let moved = 0;
    let hintShown = false;
    let startX = 0;
    let startY = 0;
    let startPos = null;

    lineEl.addEventListener('pointerdown', (e) => {
      state.suppressClick = false;
      dragging = !state.settings.locked;
      moved = 0;
      hintShown = false;
      startX = e.clientX;
      startY = e.clientY;
      startPos = { ...state.positions[which] };
      if (dragging) {
        if (lineEl.setPointerCapture) lineEl.setPointerCapture(e.pointerId);
        if (e.preventDefault) e.preventDefault();
      }
    });

    lineEl.addEventListener('pointermove', (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      moved = Math.max(moved, Math.abs(dx), Math.abs(dy));
      if (!dragging) {
        // 锁定时尝试拖动：给出解锁提示
        if (!hintShown && state.settings.locked && moved > DRAG_THRESHOLD) {
          hintShown = true;
          state.suppressClick = true;
          showNotice('字幕位置已锁定：点播放器右上角"已锁定"按钮解锁后可拖动');
        }
        return;
      }
      if (moved > DRAG_THRESHOLD) state.suppressClick = true;
      const rect = root.getBoundingClientRect();
      const clamp = (v) => Math.max(3, Math.min(97, v));
      state.positions[which] = {
        x: clamp(startPos.x + (dx / rect.width) * 100),
        y: clamp(startPos.y + (dy / rect.height) * 100),
      };
      applyPositions();
    });

    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      if (lineEl.releasePointerCapture) {
        try {
          lineEl.releasePointerCapture(e.pointerId);
        } catch {}
      }
      if (moved > DRAG_THRESHOLD) {
        persist({
          subPositions: {
            zh: { ...state.positions.zh },
            en: { ...state.positions.en },
          },
        });
      }
    };
    lineEl.addEventListener('pointerup', end);
    lineEl.addEventListener('pointercancel', end);
  }

  // Ctrl+滚轮缩放单行字号（防止触发浏览器页面缩放）
  function makeResizable(lineEl, sizeKey) {
    let persistTimer = null;
    lineEl.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const step = e.deltaY < 0 ? 2 : -2;
        state.settings[sizeKey] = Math.max(
          MIN_FONT,
          Math.min(MAX_FONT, state.settings[sizeKey] + step)
        );
        applySettings();
        clearTimeout(persistTimer);
        persistTimer = setTimeout(() => persist({ [sizeKey]: state.settings[sizeKey] }), 300);
      },
      { passive: false }
    );
  }

  // ---------- 字幕文本渲染 ----------

  function setEnText(text) {
    enLine.textContent = '';
    for (const part of text.split(/([A-Za-z][A-Za-z'-]*)/)) {
      if (!part) continue;
      if (WORD_RE.test(part)) {
        const span = document.createElement('span');
        span.className = 'yt-bisub-word';
        span.textContent = part;
        enLine.appendChild(span);
      } else {
        enLine.appendChild(document.createTextNode(part));
      }
    }
  }

  // ---------- 挂载与设置 ----------

  function mount() {
    const player = getPlayerEl();
    if (!player) return false;
    if (root && root.parentElement === player) {
      state.mounted = true;
      return true;
    }
    if (root) root.remove();

    root = document.createElement('div');
    root.className = 'yt-bisub-root';
    notice = document.createElement('div');
    notice.className = 'yt-bisub-notice';
    notice.hidden = true;
    zhLine = document.createElement('div');
    zhLine.className = 'yt-bisub-zh';
    enLine = document.createElement('div');
    enLine.className = 'yt-bisub-en';
    lockBtn = document.createElement('button');
    lockBtn.className = 'yt-bisub-lock';
    // 定位直接写内联样式作保险，不依赖 CSS 加载状态
    lockBtn.style.position = 'absolute';
    lockBtn.style.top = '10px';
    lockBtn.style.right = '10px';
    root.append(lockBtn, notice, zhLine, enLine);
    player.appendChild(root);
    state.mounted = true;

    enLine.addEventListener('click', (e) => {
      if (state.suppressClick) {
        state.suppressClick = false;
        return;
      }
      const t = e.target;
      if (t && t.classList && t.classList.contains('yt-bisub-word')) {
        showWord(t.textContent, t);
      }
    });
    lockBtn.addEventListener('click', () => {
      state.settings.locked = !state.settings.locked;
      applySettings();
      persist({ locked: state.settings.locked });
    });
    makeDraggable(zhLine, 'zh');
    makeDraggable(enLine, 'en');
    makeResizable(zhLine, 'zhFontSize');
    makeResizable(enLine, 'enFontSize');
    installDocHooks();
    applySettings();
    return true;
  }

  function applySettings() {
    if (!root) return;
    const s = state.settings;
    root.classList.toggle('yt-bisub-hidden', !s.enabled);
    root.classList.toggle('yt-bisub-unlocked', !s.locked);
    enLine.style.fontSize = s.enFontSize + 'px';
    zhLine.style.fontSize = s.zhFontSize + 'px';
    enLine.hidden = !s.showOriginal || !state.currentText;
    zhLine.hidden = !zhLine.textContent;
    lockBtn.textContent = s.locked ? '已锁定' : '可拖动';
    lockBtn.title = s.locked ? '字幕位置已锁定，点击解锁后可拖动' : '点击锁定，防止误拖字幕';
    applyPositions();
    // 插件激活期间一律隐藏原生字幕（不随字幕行开关），
    // 否则两句之间的间隙会让原生字幕闪现
    document.documentElement.classList.toggle(
      'yt-bisub-active',
      s.enabled && state.mounted
    );
  }

  function setSettings(settings) {
    Object.assign(state.settings, settings);
    if (settings.subPositions) {
      if (settings.subPositions.zh) Object.assign(state.positions.zh, settings.subPositions.zh);
      if (settings.subPositions.en) Object.assign(state.positions.en, settings.subPositions.en);
    }
    applySettings();
  }

  function setTranslateFn(fn) {
    state.translate = fn;
  }

  function setWordLookupHandler(fn) {
    state.onWordLookup = fn;
  }

  function setPersistHandler(fn) {
    state.onPersist = fn;
  }

  function showLine(text) {
    if (!root) return;
    if (!text) {
      state.currentText = '';
      state.seq++;
      clearTimeout(state.holdTimer);
      closePop();
      enLine.textContent = '';
      zhLine.textContent = '';
      applySettings();
      return;
    }
    if (text === state.currentText) return;
    state.currentText = text;
    const seq = ++state.seq;
    clearTimeout(state.holdTimer);
    closePop();

    // 译文已缓存：原文译文立即同时出现
    const cached = state.translate ? state.translate.getCached(text) : null;
    if (cached) {
      setEnText(text);
      zhLine.textContent = cached;
      applySettings();
      return;
    }

    // 译文未就绪：先保留上一行，等译文到了两行一起换；超时先出原文
    const display = (zh) => {
      if (seq !== state.seq) return;
      setEnText(text);
      zhLine.textContent = zh;
      applySettings();
    };
    state.holdTimer = setTimeout(() => display(''), HOLD_MAX);
    if (state.translate) {
      state.translate.translate(text).then((zh) => {
        if (seq !== state.seq) return;
        clearTimeout(state.holdTimer);
        display(zh);
      });
    }
  }

  function showNotice(text) {
    if (!notice) return;
    notice.textContent = text;
    notice.hidden = false;
    clearTimeout(showNotice._t);
    showNotice._t = setTimeout(() => {
      notice.hidden = true;
    }, 5000);
  }

  function hideNotice() {
    clearTimeout(showNotice._t);
    if (notice) notice.hidden = true;
  }

  function hide() {
    state.currentText = '';
    state.seq++;
    clearTimeout(state.holdTimer);
    closePop();
    if (root) {
      zhLine.textContent = '';
      enLine.textContent = '';
      root.classList.add('yt-bisub-hidden');
    }
    document.documentElement.classList.remove('yt-bisub-active');
  }

  function destroy() {
    closePop();
    if (root) root.remove();
    root = null;
    state.mounted = false;
    document.documentElement.classList.remove('yt-bisub-active');
  }

  return {
    mount,
    hide,
    destroy,
    setSettings,
    setTranslateFn,
    setWordLookupHandler,
    setPersistHandler,
    showLine,
    showNotice,
    hideNotice,
  };
})();
