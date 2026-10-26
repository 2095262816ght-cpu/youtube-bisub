// 字幕行组合器：决定"什么时候显示哪一对双语行"，纯逻辑无 DOM
// 接口：create({ translate, onPair }) → { push, clear }；中英两行总是整对吐出
// 吸收缓存快路径、hold 计时与过期结果丢弃；overlay 只负责渲染
const CaptionComposer = (() => {
  const HOLD_MAX = 1200; // 译文最长等待时间，超时先出原文（译文到了仍会补上）

  function create({ translate, onPair }) {
    let current = '';
    let seq = 0;
    let holdTimer = null;

    function clear() {
      current = '';
      seq++;
      clearTimeout(holdTimer);
      onPair({ en: '', zh: '' });
    }

    function push(text) {
      if (!text) return clear();
      if (text === current) return;
      current = text;
      const mine = ++seq;
      clearTimeout(holdTimer);

      const emit = (zh) => {
        if (mine !== seq) return;
        onPair({ en: text, zh });
      };

      // 译文已缓存：原文译文立即同时出现
      const cached = translate.getCached(text);
      if (cached) {
        emit(cached);
        return;
      }

      // 译文未就绪：界面先保留上一对，等译文到了整对一起换；超时先出原文
      holdTimer = setTimeout(() => emit(''), HOLD_MAX);
      translate.translate(text).then((zh) => {
        if (mine !== seq) return;
        clearTimeout(holdTimer);
        emit(zh);
      });
    }

    return { push, clear };
  }

  return { create };
})();
