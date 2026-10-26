// DOM 读取适配器：从 YouTube 原生字幕 DOM（.ytp-caption-window-container）取段落，
// 文本提取（过滤、归一、断句）在 CaptionText，本模块只负责 DOM 与生命周期
// 复用 YouTube 自己的字幕管线（含 PO token 与时间轴同步），只做读取
const NativeCaptions = (() => {
  const CAPTION_SEL = '.ytp-caption-window-container';
  const SEGMENT_SEL = '.ytp-caption-segment';
  const WINDOW_SEL = '[id^="caption-window-"], .ytp-caption-window';

  let observer = null;
  let settleTimer = null;
  let lastText = null;
  let ccClicked = false;
  let onLine = () => {};

  function pickRect(el) {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  }

  function readText() {
    // 原生字幕容器被本插件用 CSS 隐藏（visibility:hidden，保留布局以便测量行的位置）
    const container = document.querySelector(CAPTION_SEL);
    if (!container) return '';
    const segs = container.querySelectorAll(SEGMENT_SEL);
    if (!segs.length) return CaptionText.extract([{ text: container.textContent }]);
    const clips = new Map();
    const entries = [];
    for (const seg of segs) {
      const clip = seg.closest(WINDOW_SEL) || container;
      let clipRect = clips.get(clip);
      if (clipRect === undefined) {
        clipRect = pickRect(clip);
        clips.set(clip, clipRect);
      }
      entries.push({ text: seg.textContent, rect: pickRect(seg), clipRect });
    }
    return CaptionText.extract(entries);
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
