// 设置模型的唯一归属：默认值、storage 存取、合并与重置语义
// 内容脚本与 popup 共享（manifest / popup.html 各自引入）
// 接口：get() / set(partial) / reset(key) / subscribe(cb)
// subscribe 回调签名 (settings, changedKeys)：首次通知 changedKeys 为 null，后续为变更键数组
const Settings = (() => {
  const DEFAULT_POSITIONS = {
    zh: { x: 50, y: 87 },
    en: { x: 50, y: 80 },
  };
  const DEFAULTS = {
    enabled: true,
    showOriginal: true,
    showZh: true,
    wordLookup: true,
    blockFullscreenWheel: true,
    enFontSize: 22,
    zhFontSize: 16,
    locked: true,
    subPositions: DEFAULT_POSITIONS,
  };

  const listeners = new Set();
  let loaded = false;
  let current = resolve({});

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  // 兼容老数据：subPositions 为 null 曾表示"重置"，读到一律等同缺省
  function normalize(key, value) {
    if (key !== 'subPositions') return value;
    const d = DEFAULTS.subPositions;
    const line = (v, fallback) =>
      v && typeof v.x === 'number' && typeof v.y === 'number'
        ? { x: v.x, y: v.y }
        : { ...fallback };
    return { zh: line(value?.zh, d.zh), en: line(value?.en, d.en) };
  }

  function resolve(stored) {
    const s = {};
    for (const key of Object.keys(DEFAULTS)) {
      s[key] = normalize(key, key in stored ? stored[key] : DEFAULTS[key]);
    }
    return s;
  }

  function snapshot() {
    return clone(current);
  }

  function notify(changedKeys) {
    const snap = snapshot();
    for (const cb of listeners) {
      try {
        cb(snap, changedKeys);
      } catch {}
    }
  }

  function get() {
    return snapshot();
  }

  function set(partial) {
    const picked = {};
    for (const key of Object.keys(partial || {})) {
      if (key in DEFAULTS) picked[key] = normalize(key, partial[key]);
    }
    Object.assign(current, picked);
    // 通知不在此处发出：统一由 onChanged 到达（本地写入同样会触发）
    try {
      chrome.storage.sync.set(picked);
    } catch {}
  }

  function reset(key) {
    if (!(key in DEFAULTS)) return;
    set({ [key]: DEFAULTS[key] });
  }

  function subscribe(cb) {
    listeners.add(cb);
    if (loaded) cb(snapshot(), null);
    return () => listeners.delete(cb);
  }

  // 启动即加载；变更通知统一走 storage.onChanged 一条路（本地与远端一致）
  try {
    chrome.storage.sync.get(null, (stored) => {
      current = resolve(stored || {});
      loaded = true;
      notify(null);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const picked = {};
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (key in DEFAULTS) picked[key] = normalize(key, newValue);
      }
      if (!Object.keys(picked).length) return;
      Object.assign(current, picked);
      notify(Object.keys(picked));
    });
  } catch {
    loaded = true;
    notify(null);
  }

  return { get, set, reset, subscribe };
})();
