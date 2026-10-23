const DEFAULTS = {
  enabled: true,
  showOriginal: true,
  enFontSize: 22,
  zhFontSize: 16,
};

const els = {
  enabled: document.getElementById('enabled'),
  showOriginal: document.getElementById('showOriginal'),
  enFontSize: document.getElementById('enFontSize'),
  zhFontSize: document.getElementById('zhFontSize'),
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
  setSelectValue(els.enFontSize, stored.enFontSize);
  setSelectValue(els.zhFontSize, stored.zhFontSize);
});

function save() {
  chrome.storage.sync.set(
    {
      enabled: els.enabled.checked,
      showOriginal: els.showOriginal.checked,
      enFontSize: Number(els.enFontSize.value),
      zhFontSize: Number(els.zhFontSize.value),
    },
    () => flashStatus('已保存')
  );
}

els.enabled.addEventListener('change', save);
els.showOriginal.addEventListener('change', save);
els.enFontSize.addEventListener('change', save);
els.zhFontSize.addEventListener('change', save);
