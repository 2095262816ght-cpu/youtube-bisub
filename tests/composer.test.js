const { test } = require('node:test');
const assert = require('node:assert');
const { loadScripts, getGlobal } = require('./helpers/load-script');

// vm 沙箱里的对象与本 realm 原型不同，deepStrictEqual 会拒绝；序列化后比较
const plain = (v) => JSON.parse(JSON.stringify(v));

function loadComposer() {
  const context = loadScripts(['src/content/composer.js']);
  return getGlobal(context, 'CaptionComposer');
}

function fakeTranslate({ cached = {} } = {}) {
  const pending = new Map();
  return {
    calls: [],
    getCached: (text) => (text in cached ? cached[text] : null),
    translate(text) {
      this.calls.push(text);
      return new Promise((res) => pending.set(text, res));
    },
    resolve(text, zh) {
      pending.get(text)(zh);
    },
  };
}

function collect() {
  const pairs = [];
  return { pairs, onPair: (p) => pairs.push(p) };
}

test('缓存命中立即整对吐出', () => {
  const CaptionComposer = loadComposer();
  const translate = fakeTranslate({ cached: { Hello: '你好' } });
  const { pairs, onPair } = collect();
  const c = CaptionComposer.create({ translate, onPair });
  c.push('Hello');
  assert.deepStrictEqual(plain(pairs), [{ en: 'Hello', zh: '你好' }]);
  assert.deepStrictEqual(translate.calls, []);
});

test('译文到达后整对换行', async () => {
  const CaptionComposer = loadComposer();
  const translate = fakeTranslate();
  const { pairs, onPair } = collect();
  const c = CaptionComposer.create({ translate, onPair });
  c.push('Hello');
  assert.deepStrictEqual(plain(pairs), [], '译文未到前不换行');
  translate.resolve('Hello', '你好');
  await null;
  assert.deepStrictEqual(plain(pairs), [{ en: 'Hello', zh: '你好' }]);
});

test('hold 超时先出原文，译文迟到仍补上', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const CaptionComposer = loadComposer();
  const translate = fakeTranslate();
  const { pairs, onPair } = collect();
  const c = CaptionComposer.create({ translate, onPair });
  c.push('Hello');
  t.mock.timers.tick(1200);
  assert.deepStrictEqual(plain(pairs), [{ en: 'Hello', zh: '' }], '超时先出原文');
  translate.resolve('Hello', '你好');
  await null;
  assert.deepStrictEqual(
    plain(pairs),
    [
      { en: 'Hello', zh: '' },
      { en: 'Hello', zh: '你好' },
    ],
    '迟到但未过期的译文补上'
  );
});

test('换行后旧译文丢弃', async () => {
  const CaptionComposer = loadComposer();
  const translate = fakeTranslate();
  const { pairs, onPair } = collect();
  const c = CaptionComposer.create({ translate, onPair });
  c.push('One');
  c.push('Two');
  translate.resolve('One', '一');
  await null;
  assert.deepStrictEqual(plain(pairs), [], '过期译文不吐出');
  translate.resolve('Two', '二');
  await null;
  assert.deepStrictEqual(plain(pairs), [{ en: 'Two', zh: '二' }]);
});

test('同一行重复推送不重复翻译', async () => {
  const CaptionComposer = loadComposer();
  const translate = fakeTranslate();
  const { pairs, onPair } = collect();
  const c = CaptionComposer.create({ translate, onPair });
  c.push('Hello');
  c.push('Hello');
  assert.deepStrictEqual(translate.calls, ['Hello']);
  translate.resolve('Hello', '你好');
  await null;
  assert.deepStrictEqual(plain(pairs), [{ en: 'Hello', zh: '你好' }]);
});

test('clear 吐空对并丢弃挂起译文', async () => {
  const CaptionComposer = loadComposer();
  const translate = fakeTranslate();
  const { pairs, onPair } = collect();
  const c = CaptionComposer.create({ translate, onPair });
  c.push('Hello');
  c.clear();
  assert.deepStrictEqual(plain(pairs), [{ en: '', zh: '' }]);
  translate.resolve('Hello', '你好');
  await null;
  assert.deepStrictEqual(plain(pairs), [{ en: '', zh: '' }], 'clear 后旧译文不再吐出');
});

test('空文本等同 clear', () => {
  const CaptionComposer = loadComposer();
  const translate = fakeTranslate();
  const { pairs, onPair } = collect();
  const c = CaptionComposer.create({ translate, onPair });
  c.push('');
  assert.deepStrictEqual(plain(pairs), [{ en: '', zh: '' }]);
});
