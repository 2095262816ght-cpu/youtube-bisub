// 字幕文本提取：段落（文本 + 可选矩形）进、当前句出，纯逻辑无 DOM
// DOM 读取适配器是 native.js，测试用 fixture 适配器（两侧同接缝）
const CaptionText = (() => {
  const MAX_UNIT = 150; // 超过这个长度按“自动字幕累积的历史”处理
  const TAIL_MIN = 12; // 尾句过短时连上一句一起保留，避免只剩孤词
  const CJK_RE = /([一-龥㐀-䶿぀-ヿ가-힣])\s+(?=[一-龥㐀-䶿぀-ヿ가-힣])/g;
  const ENDER_RE = /[A-Za-z一-龥぀-ヿ가-힣][.!?…。！？]["'”’)\]】》」』]*(?=\s|$|[一-龥぀-ヿ가-힣])/g;
  const ABBREV_RE = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|approx|min|max|no|vol|fig|cf|al|e\.g|i\.e)\.|\b[A-Z]\./gi;

  // 自动字幕（rollup）会把滚出可视区的旧行留在 DOM 里，只保留正在显示的段：
  // 段的矩形落在所属字幕窗口矩形内才算可见；没有矩形信息（fixture）则原样保留
  function visibleEntries(entries) {
    const out = [];
    for (const e of entries) {
      const c = e.clipRect;
      const r = e.rect;
      if (!c || !r || !(c.bottom > c.top)) {
        out.push(e);
        continue;
      }
      if (r.bottom > r.top && r.bottom > c.top + 1 && r.top < c.bottom - 1) out.push(e);
    }
    return out.length ? out : entries;
  }

  // 段自带词间空格，但行与行的交界会丢；统一补成单个空格（中日韩之间不加）
  function normalize(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/([A-Za-z])- (?=[a-z])/g, '$1-')
      .replace(CJK_RE, '$1')
      .trim();
  }

  // 兜底：自动字幕可能把长时间的累积文本全堆在窗口里，只保留正在说的最后一句
  function currentUnit(text) {
    if (text.length <= MAX_UNIT) return text;
    const masked = text.replace(ABBREV_RE, (m) => m.slice(0, -1) + ' ');
    const cuts = [];
    let m;
    while ((m = ENDER_RE.exec(masked))) cuts.push(m.index + m[0].length);
    if (cuts.length) {
      const tail = text.slice(cuts[cuts.length - 1]).trim();
      if (tail.length >= TAIL_MIN) return tail;
      return cuts.length >= 2 ? text.slice(cuts[cuts.length - 2]).trim() : text;
    }
    // 无句末标点：只在真的很长时取尾部截断，避免把完整的长句拦腰剪掉
    if (text.length <= MAX_UNIT * 2) return text;
    const tail = text.slice(-MAX_UNIT);
    const i = tail.search(/[\s,，、；;]/);
    return (i >= 0 ? tail.slice(i + 1) : tail).trim();
  }

  function extract(entries) {
    const texts = visibleEntries(entries).map((e) => e.text);
    return currentUnit(normalize(texts.join(' ')));
  }

  return { extract };
})();
