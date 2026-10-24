const DEFAULTS = {
  enabled: true,
  showOriginal: true,
  showZh: true,
  wordLookup: true,
  blockFullscreenWheel: true,
  enFontSize: 22,
  zhFontSize: 16,
};

const els = {
  enabled: document.getElementById('enabled'),
  showOriginal: document.getElementById('showOriginal'),
  showZh: document.getElementById('showZh'),
  wordLookup: document.getElementById('wordLookup'),
  blockFullscreenWheel: document.getElementById('blockFullscreenWheel'),
  enFontSize: document.getElementById('enFontSize'),
  zhFontSize: document.getElementById('zhFontSize'),
  resetPosition: document.getElementById('resetPosition'),
  status: document.getElementById('status'),
};

function flashStatus(text) {
  els.status.textContent = text;
  clearTimeout(flashStatus._t);
  flashStatus._t = setTimeout(() => {
    els.status.textContent = '';
  }, 1500);
}

// Ctrl+滚轮会产生任意字号值，选项里没有时补一项
function setSelectValue(sel, value) {
  const v = String(value);
  if (![...sel.options].some((o) => o.value === v)) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v + 'px';
    sel.appendChild(opt);
  }
  sel.value = v;
}

chrome.storage.sync.get(DEFAULTS, (stored) => {
  els.enabled.checked = stored.enabled;
  els.showOriginal.checked = stored.showOriginal;
  els.showZh.checked = stored.showZh;
  els.wordLookup.checked = stored.wordLookup;
  els.blockFullscreenWheel.checked = stored.blockFullscreenWheel;
  setSelectValue(els.enFontSize, stored.enFontSize);
  setSelectValue(els.zhFontSize, stored.zhFontSize);
});

function save() {
  chrome.storage.sync.set(
    {
      enabled: els.enabled.checked,
      showOriginal: els.showOriginal.checked,
      showZh: els.showZh.checked,
      wordLookup: els.wordLookup.checked,
      blockFullscreenWheel: els.blockFullscreenWheel.checked,
      enFontSize: Number(els.enFontSize.value),
      zhFontSize: Number(els.zhFontSize.value),
    },
    () => flashStatus('已保存')
  );
}

els.enabled.addEventListener('change', save);
els.showOriginal.addEventListener('change', save);
els.showZh.addEventListener('change', save);
els.wordLookup.addEventListener('change', save);
els.blockFullscreenWheel.addEventListener('change', save);
els.enFontSize.addEventListener('change', save);
els.zhFontSize.addEventListener('change', save);

// 内容脚本收到 subPositions 为 null 时恢复默认位置
els.resetPosition.addEventListener('click', () => {
  chrome.storage.sync.set({ subPositions: null }, () => flashStatus('已重置字幕位置'));
});
