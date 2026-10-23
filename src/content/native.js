// 读取 YouTube 原生字幕 DOM（.ytp-caption-window-container）的当前文本
// 复用 YouTube 自己的字幕管线（含 PO token 与时间轴同步），只做读取
const NativeCaptions = (() => {
  const CAPTION_SEL = '.ytp-caption-window-container';
  const SEGMENT_SEL = '.ytp-caption-segment';
  const WINDOW_SEL = '[id^="caption-window-"], .ytp-caption-window';
  const MAX_UNIT = 150; // 超过这个长度按“自动字幕累积的历史”处理
  const TAIL_MIN = 12; // 尾句过短时连上一句一起保留，避免只剩孤词
  const CJK_RE = /([一-龥㐀-䶿぀-ヿ가-힣])\s+(?=[一-龥㐀-䶿぀-ヿ가-힣])/g;
  const ENDER_RE = /[A-Za-z一-龥぀-ヿ가-힣][.!?…。！？]["'”’)\]】》」』]*(?=\s|$|[一-龥぀-ヿ가-힣])/g;
  const ABBREV_RE = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|approx|min|max|no|vol|fig|cf|al|e\.g|i\.e)\.|\b[A-Z]\./gi;

  let observer = null;
  let settleTimer = null;
  let lastText = null;
  let ccClicked = false;
  let onLine = () => {};

  // 自动字幕（rollup）会把滚出可视区的旧行留在 DOM 里，只取当前窗口内可见的段
  function visibleSegments(container) {
    const segs = container.querySelectorAll(SEGMENT_SEL);
    const clips = new Map();
    const out = [];
    for (const seg of segs) {
      const clip = seg.closest(WINDOW_SEL) || container;
      let box = clips.get(clip);
      if (box === undefined) {
        const r = clip.getBoundingClientRect();
        box = r.height > 0 ? { top: r.top, bottom: r.bottom } : null;
        clips.set(clip, box);
      }
      if (!box) {
        out.push(seg);
        continue;
      }
      const r = seg.getBoundingClientRect();
      if (r.height > 0 && r.bottom > box.top + 1 && r.top < box.bottom - 1) out.push(seg);
    }
    return out.length ? out : Array.from(segs);
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

  function readText() {
    // 原生字幕容器被本插件用 CSS 隐藏（visibility:hidden，保留布局以便测量行的位置）
    const container = document.querySelector(CAPTION_SEL);
    if (!container) return '';
    const segs = visibleSegments(container);
    const text = segs.length
      ? Array.from(segs, (s) => s.textContent).join(' ')
      : container.textContent;
    return currentUnit(normalize(text));
  }

  function settle() {
    clearTimeout(settleTimer);
    // 自动字幕会逐词渲染，等文本稳定后再上报
    settleTimer = setTimeout(() => {
      const text = readText();
      if (text !== lastText) {
        lastText = text;
        onLine(text);
      }
    }, 150);
  }

  function start(callback) {
    onLine = callback;
    const player = document.getElementById('movie_player');
    if (!player || observer) return false;
    observer = new MutationObserver(settle);
    observer.observe(player, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return true;
  }

  function stop() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(settleTimer);
    lastText = null;
    ccClicked = false;
  }

  function isCaptionsButtonPressed() {
    const btn = document.querySelector('button.ytp-subtitles-button');
    return btn ? btn.getAttribute('aria-pressed') === 'true' : null;
  }

  function enableNativeCaptions() {
    const btn = document.querySelector('button.ytp-subtitles-button');
    if (!btn) return false;
    // 每个视频最多点一次，防止 aria-pressed 缺失时反复点击变成开关切换
    if (btn.getAttribute('aria-pressed') !== 'true' && !ccClicked) {
      ccClicked = true;
      btn.click();
    }
    return true;
  }

  return { start, stop, readText, isCaptionsButtonPressed, enableNativeCaptions };
})();
