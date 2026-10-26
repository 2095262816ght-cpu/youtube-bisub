// 后台服务：词典查询 + 请求头修正
// 有道接口对任何带 Origin 的请求一律 403（防盗链），浏览器 fetch 必带 Origin，
// 用 declarativeNetRequest 把 Origin 改写成接口自身域名（已实测该值可通过）
// 服务脚本位于 src/ 下，相对路径会按 worker 位置解析，必须用扩展根的绝对路径
importScripts('/src/shared/dict-card.js');

const DICT_RULE_ID = 1;

chrome.declarativeNetRequest
  .updateDynamicRules({
    removeRuleIds: [DICT_RULE_ID],
    addRules: [
      {
        id: DICT_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Origin', operation: 'set', value: 'https://dict.youdao.com' },
          ],
        },
        condition: {
          urlFilter: '||dict.youdao.com/',
          resourceTypes: ['xmlhttprequest'],
        },
      },
    ],
  })
  .catch(() => {});

async function lookupDict(word) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(
      'https://dict.youdao.com/jsonapi?jsonversion=2&le=en&q=' + encodeURIComponent(word),
      { signal: ctrl.signal }
    );
    if (!res.ok) throw new Error('dict failed: ' + res.status);
    return DictCard.fromYoudao(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'dict-lookup') return;
  lookupDict(msg.word).then(
    (result) => sendResponse({ ok: true, result }),
    () => sendResponse({ ok: false })
  );
  return true;
});
