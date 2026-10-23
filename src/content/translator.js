// 翻译引擎：优先 Chrome 本地翻译（离线零延迟），回退 Google 免费接口
// 两层都带缓存、限流、快失败（超时+单次重试），失败时返回原文并触发 onError
const Translator = (() => {
  const GTX = 'https://translate.googleapis.com/translate_a/single';
  const CONCURRENCY = 2;
  const MIN_INTERVAL = 200;
  const MAX_CACHE = 4000;
  const FETCH_TIMEOUT = 4000;

  // Chrome 内置 Translator API（window.Translator），与本模块同名，
  // 必须显式从 globalThis 取，裸标识符会命中本模块的 const
  const ChromeAI = globalThis.Translator;

  const cache = new Map();
  const pending = new Map();
  const queue = [];
  let running = 0;
  let lastRun = 0;
  let local = null;
  let localStatus = 'idle'; // idle | downloading | ready | needs-activation | unsupported
  let onStatus = () => {};
  let onError = () => {};

  function looksEnglish(text) {
    const letters = text.replace(/[^a-zA-Z]/g, '').length;
    return letters >= text.length * 0.5;
  }

  function looksChinese(text) {
    return /[一-鿿]/.test(text) && !looksEnglish(text);
  }

  function schedule() {
    while (running < CONCURRENCY && queue.length) {
      const job = queue.shift();
      const wait = Math.max(0, lastRun + MIN_INTERVAL - Date.now());
      running++;
      setTimeout(() => {
        lastRun = Date.now();
        Promise.resolve()
          .then(job)
          .catch(() => {})
          .finally(() => {
            running--;
            schedule();
          });
      }, wait);
    }
  }

  function remember(text, zh) {
    if (cache.size >= MAX_CACHE) {
      for (const key of cache.keys()) {
        cache.delete(key);
        if (cache.size < MAX_CACHE * 0.9) break;
      }
    }
    cache.set(text, zh);
  }

  async function requestGoogle(text) {
    const url = `${GTX}?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error('translate failed: ' + res.status);
        const data = await res.json();
        const zh = (data[0] || []).map((seg) => seg[0] || '').join('').trim();
        return zh || text;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }

  async function requestLocal(text) {
    if (!local) throw new Error('local not ready');
    return (await local.translate(text)).trim() || text;
  }

  async function request(text) {
    if (looksChinese(text)) return text;
    try {
      if (local && looksEnglish(text)) return await requestLocal(text);
    } catch (e) {
      // 本地引擎异常时继续走网络，不直接失败
    }
    return requestGoogle(text);
  }

  function enqueue(text, resolve) {
    if (cache.has(text)) {
      if (resolve) resolve(cache.get(text));
      return;
    }
    if (pending.has(text)) {
      if (resolve) pending.get(text).then(resolve);
      return;
    }
    const p = new Promise((res) => {
      queue.push(async () => {
        try {
          const zh = await request(text);
          remember(text, zh);
          res(zh);
        } catch {
          onError();
          res(text);
        } finally {
          pending.delete(text);
        }
      });
      schedule();
    });
    pending.set(text, p);
    if (resolve) p.then(resolve);
  }

  async function initLocal(statusCb) {
    if (statusCb) onStatus = statusCb;
    if (!ChromeAI || typeof ChromeAI.create !== 'function') {
      localStatus = 'unsupported';
      onStatus(localStatus);
      return;
    }
    if (localStatus === 'ready' || localStatus === 'downloading') return;
    try {
      const avail = await ChromeAI.availability({
        sourceLanguage: 'en',
        targetLanguage: 'zh',
      });
      if (avail === 'unavailable') {
        localStatus = 'unsupported';
        onStatus(localStatus);
        return;
      }
      localStatus = 'downloading';
      onStatus(localStatus, 0);
      local = await ChromeAI.create({
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            onStatus('downloading', e.loaded);
          });
        },
      });
      localStatus = 'ready';
      onStatus(localStatus);
    } catch (e) {
      localStatus = /activation|notallowed/i.test(String(e && e.name) + String(e && e.message))
        ? 'needs-activation'
        : 'unsupported';
      onStatus(localStatus);
    }
  }

  return {
    translate(text) {
      if (cache.has(text)) return Promise.resolve(cache.get(text));
      enqueue(text);
      return pending.get(text) || Promise.resolve(text);
    },
    getCached(text) {
      return cache.get(text) || null;
    },
    initLocal,
    getLocalStatus() {
      return localStatus;
    },
    setStatusCallback(cb) {
      onStatus = cb;
    },
    setErrorCallback(cb) {
      onError = cb;
    },
  };
})();
