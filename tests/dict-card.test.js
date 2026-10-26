const { test } = require('node:test');
const assert = require('node:assert');
const { loadScripts, getGlobal } = require('./helpers/load-script');

// vm 沙箱里的对象与本 realm 原型不同，deepStrictEqual 会拒绝；序列化后比较
const plain = (v) => JSON.parse(JSON.stringify(v));

const { DictCard } = (() => {
  const context = loadScripts(['src/shared/dict-card.js']);
  return { DictCard: getGlobal(context, 'DictCard') };
})();

const full = {
  simple: { word: [{ usphone: 'wɜːrd', ukphone: 'wɜːd' }] },
  ec: {
    word: [
      {
        trs: [
          { tr: [{ l: { i: ['n. 单词', 'n. 话语'] } }] },
          { tr: [{ l: { i: 'v. 措辞' } }] },
        ],
      },
    ],
  },
};

test('有道响应归一为卡片模型', () => {
  assert.deepStrictEqual(plain(DictCard.fromYoudao(full)), {
    usphone: 'wɜːrd',
    ukphone: 'wɜːd',
    defs: ['n. 单词', 'n. 话语', 'v. 措辞'],
  });
});

test('音标缺失时回退 ec，释义缺失时为空', () => {
  const card = DictCard.fromYoudao({
    ec: { word: [{ usphone: 'kæt', ukphone: 'kæt', trs: [] }] },
  });
  assert.deepStrictEqual(plain(card), { usphone: 'kæt', ukphone: 'kæt', defs: [] });
});

test('响应整体缺失时得到空卡片', () => {
  assert.deepStrictEqual(plain(DictCard.fromYoudao({})), {
    usphone: '',
    ukphone: '',
    defs: [],
  });
});

test('模型不截断释义（展示条数在渲染侧）', () => {
  const trs = [1, 2, 3, 4, 5, 6].map((n) => ({ tr: [{ l: { i: `def ${n}` } }] }));
  const card = DictCard.fromYoudao({ ec: { word: [{ trs }] } });
  assert.strictEqual(card.defs.length, 6);
});

test('isEmpty：无音标无释义为空', () => {
  assert.strictEqual(DictCard.isEmpty(null), true);
  assert.strictEqual(DictCard.isEmpty(DictCard.fromYoudao({})), true);
  assert.strictEqual(DictCard.isEmpty(DictCard.fromYoudao(full)), false);
  assert.strictEqual(
    DictCard.isEmpty({ usphone: '', ukphone: 'kæt', defs: [] }),
    false,
    '仅英音音标也算有内容'
  );
});
