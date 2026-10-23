// 词典查询客户端：请求由后台 service worker 发出
// （有道接口会 403 拒绝带 Origin 的请求，页面上下文的 fetch 无法去掉 Origin）
const Dictionary = (() => {
  const cache = new Map();

  async function lookup(word) {
    const key = word.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const res = await chrome.runtime.sendMessage({ type: 'dict-lookup', word });
    if (!res || !res.ok) throw new Error('dict lookup failed');
    cache.set(key, res.result);
    return res.result;
  }

  return { lookup };
})();
