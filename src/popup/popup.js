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

function render(s) {
  els.enabled.checked = s.enabled;
  els.showOriginal.checked = s.showOriginal;
  els.showZh.checked = s.showZh;
  els.wordLookup.checked = s.wordLookup;
  els.blockFullscreenWheel.checked = s.blockFullscreenWheel;
  setSelectValue(els.enFontSize, s.enFontSize);
  setSelectValue(els.zhFontSize, s.zhFontSize);
}

Settings.subscribe(render);

function bind(key, el, read) {
  el.addEventListener('change', () => {
    Settings.set({ [key]: read(el) });
    flashStatus('已保存');
  });
}

bind('enabled', els.enabled, (el) => el.checked);
bind('showOriginal', els.showOriginal, (el) => el.checked);
bind('showZh', els.showZh, (el) => el.checked);
bind('wordLookup', els.wordLookup, (el) => el.checked);
bind('blockFullscreenWheel', els.blockFullscreenWheel, (el) => el.checked);
bind('enFontSize', els.enFontSize, (el) => Number(el.value));
bind('zhFontSize', els.zhFontSize, (el) => Number(el.value));

els.resetPosition.addEventListener('click', () => {
  Settings.reset('subPositions');
  flashStatus('已重置字幕位置');
});
