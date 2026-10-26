const { test } = require('node:test');
const assert = require('node:assert');
const { loadScripts, getGlobal } = require('./helpers/load-script');

// vm 沙箱里的对象与本 realm 原型不同，deepStrictEqual 会拒绝；序列化后比较
const plain = (v) => JSON.parse(JSON.stringify(v));

function fakeChrome(initial = {}) {
  const store = JSON.parse(JSON.stringify(initial));
  const changeListeners = [];
  // 本地 set 与远端写入同样触发 onChanged（对齐真实 chrome 行为）
  function fire(partial) {
    const changes = {};
    for (const [k, v] of Object.entries(partial)) {
      changes[k] = { newValue: v, oldValue: store[k] };
      store[k] = JSON.parse(JSON.stringify(v));
    }
    for (const l of changeListeners) l(changes, 'sync');
  }
  return {
    storage: {
      sync: {
        get(_keys, cb) {
          cb(JSON.parse(JSON.stringify(store)));
        },
        set: fire,
      },
      onChanged: {
        addListener(l) {
          changeListeners.push(l);
        },
      },
    },
    _store: store,
    _fireRemote: fire,
  };
}

function loadSettings(stored) {
  const chrome = fakeChrome(stored);
  const context = loadScripts(['src/shared/settings.js'], { chrome });
  return { Settings: getGlobal(context, 'Settings'), chrome };
}

test('空存储时 get() 返回全部默认值', () => {
  const { Settings } = loadSettings();
  const s = Settings.get();
  assert.strictEqual(s.enabled, true);
  assert.strictEqual(s.showOriginal, true);
  assert.strictEqual(s.showZh, true);
  assert.strictEqual(s.wordLookup, true);
  assert.strictEqual(s.blockFullscreenWheel, true);
  assert.strictEqual(s.enFontSize, 22);
  assert.strictEqual(s.zhFontSize, 16);
  assert.strictEqual(s.locked, true);
  assert.deepStrictEqual(plain(s.subPositions), {
    zh: { x: 50, y: 87 },
    en: { x: 50, y: 80 },
  });
});

test('老数据 subPositions:null 读到等同缺省（兼容重置暗号）', () => {
  const { Settings } = loadSettings({ subPositions: null, enFontSize: 30 });
  const s = Settings.get();
  assert.strictEqual(s.enFontSize, 30);
  assert.deepStrictEqual(plain(s.subPositions), {
    zh: { x: 50, y: 87 },
    en: { x: 50, y: 80 },
  });
});

test('subPositions 缺行时按缺省补全', () => {
  const { Settings } = loadSettings({ subPositions: { zh: { x: 10, y: 20 } } });
  const s = Settings.get();
  assert.deepStrictEqual(plain(s.subPositions.zh), { x: 10, y: 20 });
  assert.deepStrictEqual(plain(s.subPositions.en), { x: 50, y: 80 });
});

test('set() 合并并持久化', () => {
  const { Settings, chrome } = loadSettings();
  Settings.set({ enFontSize: 30, zhFontSize: 14 });
  assert.strictEqual(Settings.get().enFontSize, 30);
  assert.strictEqual(Settings.get().zhFontSize, 14);
  assert.strictEqual(chrome._store.enFontSize, 30);
});

test('set() 丢弃未知键', () => {
  const { Settings, chrome } = loadSettings();
  Settings.set({ bogus: 1, enabled: false });
  assert.strictEqual(Settings.get().bogus, undefined);
  assert.strictEqual(chrome._store.bogus, undefined);
  assert.strictEqual(Settings.get().enabled, false);
});

test("reset('subPositions') 写入默认位置，不再产生 null 暗号", () => {
  const { Settings, chrome } = loadSettings({
    subPositions: { zh: { x: 5, y: 5 }, en: { x: 6, y: 6 } },
  });
  Settings.reset('subPositions');
  assert.deepStrictEqual(plain(Settings.get().subPositions), {
    zh: { x: 50, y: 87 },
    en: { x: 50, y: 80 },
  });
  assert.notStrictEqual(chrome._store.subPositions, null);
  assert.deepStrictEqual(chrome._store.subPositions.zh, { x: 50, y: 87 });
});

test('subscribe：加载后首次回调 changedKeys 为 null，set 后为变更键', () => {
  const { Settings, chrome } = loadSettings({ enFontSize: 30 });
  const calls = [];
  Settings.subscribe((s, changedKeys) => calls.push([s.enFontSize, plain(changedKeys)]));
  assert.deepStrictEqual(calls, [[30, null]]);

  Settings.set({ enFontSize: 34 });
  assert.deepStrictEqual(calls[1], [34, ['enFontSize']]);

  chrome._fireRemote({ enFontSize: 18 });
  assert.deepStrictEqual(calls[2], [18, ['enFontSize']]);
});

test('subscribe 加载完成后注册也立即收到首次回调', () => {
  const { Settings } = loadSettings();
  Settings.get();
  const calls = [];
  Settings.subscribe((s, changedKeys) => calls.push(plain(changedKeys)));
  assert.deepStrictEqual(calls, [null]);
});

test('get() 返回快照，调用方改动不影响内部状态', () => {
  const { Settings } = loadSettings();
  const a = Settings.get();
  a.enFontSize = 99;
  a.subPositions.zh.x = 99;
  assert.strictEqual(Settings.get().enFontSize, 22);
  assert.strictEqual(Settings.get().subPositions.zh.x, 50);
});
