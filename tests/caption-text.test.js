const { test } = require('node:test');
const assert = require('node:assert');
const { loadScripts, getGlobal } = require('./helpers/load-script');

const context = loadScripts(['src/content/caption-text.js']);
const CaptionText = getGlobal(context, 'CaptionText');

const extract = (...texts) => CaptionText.extract(texts.map((text) => ({ text })));

// 超过 MAX_UNIT(150) 的累积前缀，供“只留最后一句”类用例共用
const LONG_FIRST =
  'He thought back on all those quiet rainy days near the old river station where they all once met and talked together for a long while about the old days. ';

test('短文本原样输出（仅归一空白）', () => {
  assert.strictEqual(extract('  Hello   world. '), 'Hello world.');
});

test('CJK 文字之间不加空格', () => {
  assert.strictEqual(extract('你 好 世 界'), '你好世界');
});

test('连字符断行接回', () => {
  assert.strictEqual(extract('inter- est'), 'inter-est');
});

test('累积文本只留最后一句', () => {
  const text = LONG_FIRST + 'He slept now.';
  assert.ok(text.length > 150);
  assert.strictEqual(extract(text), 'He slept now.');
});

test('缩写（Dr.）不当句尾断点', () => {
  const text = LONG_FIRST + 'Dr. Brown arrived.';
  assert.ok(text.length > 150);
  assert.strictEqual(extract(text), 'Dr. Brown arrived.');
});

test('尾句过短时连上一句一起保留', () => {
  const text = LONG_FIRST + 'They all went home. Ok';
  assert.ok(text.length > 150);
  assert.strictEqual(extract(text), 'They all went home. Ok');
});

test('中等长度无句末标点不拦腰截断', () => {
  const text = 'y'.repeat(200);
  assert.strictEqual(extract(text), text);
});

test('超长无句末标点取尾部', () => {
  assert.strictEqual(extract('x'.repeat(320)), 'x'.repeat(150));
});

test('可见段过滤：只留落在字幕窗口内的段', () => {
  const entries = [
    { text: 'gone', rect: { top: -50, bottom: -30 }, clipRect: { top: 0, bottom: 100 } },
    { text: 'seen', rect: { top: 10, bottom: 30 }, clipRect: { top: 0, bottom: 100 } },
  ];
  assert.strictEqual(CaptionText.extract(entries), 'seen');
});

test('全部不可见时回退到全部段', () => {
  const entries = [
    { text: 'one', rect: { top: -50, bottom: -30 }, clipRect: { top: 0, bottom: 100 } },
    { text: 'two', rect: { top: -20, bottom: -1 }, clipRect: { top: 0, bottom: 100 } },
  ];
  assert.strictEqual(CaptionText.extract(entries), 'one two');
});

test('字幕窗口高度为 0 时不做过滤', () => {
  const entries = [
    { text: 'kept', rect: { top: -50, bottom: -30 }, clipRect: { top: 0, bottom: 0 } },
    { text: 'also', rect: { top: 10, bottom: 30 }, clipRect: { top: 0, bottom: 0 } },
  ];
  assert.strictEqual(CaptionText.extract(entries), 'kept also');
});

test('无矩形信息的段（fixture 用法）原样保留', () => {
  assert.strictEqual(extract('plain one', 'plain two'), 'plain one plain two');
});
