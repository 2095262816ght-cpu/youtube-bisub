// 编排：设置订阅、自动开启原生字幕（CC）、驱动字幕读取器与叠加层
(() => {
  let currentVideoId = null;
  let watching = false;

  SubtitleOverlay.setTranslateFn(Translator);
  SubtitleOverlay.setWordLookupHandler((word) => Dictionary.lookup(word));
  SubtitleOverlay.setPersistHandler((partial) => Settings.set(partial));
  SubtitleOverlay.setSettings(Settings.get());

  function onCaptionLine(text) {
    if (!Settings.get().enabled) return;
    SubtitleOverlay.showLine(text);
  }

  function startWatching() {
    if (!watching) {
      NativeCaptions.start(onCaptionLine);
      watching = true;
    }
    SubtitleOverlay.mount();
  }

  function onVideoChange() {
    const videoId = videoIdFromUrl();
    if (!videoId) {
      currentVideoId = null;
      watching = false;
      NativeCaptions.stop();
      SubtitleOverlay.hide();
      return;
    }
    if (videoId === currentVideoId) return;
    currentVideoId = videoId;
    watching = false;
    NativeCaptions.stop();
    SubtitleOverlay.hide();
    startWatching();

    // 自动开启原生字幕：按钮可能晚于页面出现，多次尝试
    let tries = 0;
    const tryEnable = setInterval(() => {
      tries++;
      const pressed = NativeCaptions.isCaptionsButtonPressed();
      const enabled = Settings.get().enabled;
      if (pressed === true) {
        clearInterval(tryEnable);
        SubtitleOverlay.hideNotice();
      } else if (pressed === false && enabled) {
        NativeCaptions.enableNativeCaptions();
      }
      if (tries >= 10) {
        clearInterval(tryEnable);
        if (pressed === null) {
          SubtitleOverlay.showNotice('该视频没有可用字幕');
        } else if (pressed === false && enabled) {
          SubtitleOverlay.showNotice('请点播放器上的 CC 按钮开启字幕');
        }
      }
    }, 1000);
  }

  function videoIdFromUrl() {
    return new URLSearchParams(location.search).get('v');
  }

  // YouTube 是 SPA，监听页面内导航事件 + 轮询兜底
  document.addEventListener('yt-navigate-finished', () => {
    setTimeout(onVideoChange, 500);
  });
  setInterval(() => {
    if (videoIdFromUrl() !== currentVideoId) onVideoChange();
    if (currentVideoId && !watching) startWatching();
  }, 1500);

  // 设置变更：快照交给叠加层；开关切换有额外副作用
  let started = false;
  Settings.subscribe((s, changedKeys) => {
    SubtitleOverlay.setSettings(s);
    if (!started) {
      started = true;
      onVideoChange();
    }
    if (changedKeys && changedKeys.includes('enabled')) {
      if (s.enabled) {
        SubtitleOverlay.showLine(NativeCaptions.readText());
        NativeCaptions.enableNativeCaptions();
      } else {
        SubtitleOverlay.hide();
      }
    }
  });

  // 播放器可能晚于页面出现，轮询挂载字幕层
  const mountTimer = setInterval(() => {
    if (SubtitleOverlay.mount()) clearInterval(mountTimer);
  }, 1000);

  // 本地翻译引擎状态提示；失败提示 30 秒内最多一次
  let lastErrorNotice = 0;
  let activationHooked = false;
  Translator.setErrorCallback(() => {
    if (Date.now() - lastErrorNotice > 30000) {
      lastErrorNotice = Date.now();
      SubtitleOverlay.showNotice('翻译接口暂不可用，已显示原文');
    }
  });
  Translator.setStatusCallback((status, progress) => {
    if (status === 'downloading') {
      SubtitleOverlay.showNotice(
        '本地翻译模型下载中 ' + Math.round((progress || 0) * 100) + '%（仅首次，之后离线零延迟）'
      );
    } else if (status === 'ready') {
      SubtitleOverlay.showNotice('本地翻译已就绪（零延迟）');
    } else if (status === 'needs-activation') {
      SubtitleOverlay.showNotice('点页面任意处可启用本地翻译（零延迟）');
      if (!activationHooked) {
        activationHooked = true;
        const enable = () => {
          document.removeEventListener('pointerdown', enable);
          Translator.initLocal();
        };
        document.addEventListener('pointerdown', enable);
      }
    }
  });
  Translator.initLocal();
})();
