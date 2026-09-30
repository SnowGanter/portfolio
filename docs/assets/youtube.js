(() => {
  const frames = [...document.querySelectorAll('[data-youtube-id]')];
  if (!frames.length) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let apiPromise;
  function loadAPI() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const previous = window.onYouTubeIframeAPIReady;
      const timer = setTimeout(() => fail(), 15000);
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        apiPromise = null;
        reject(new Error('YouTube недоступен. Попробуйте ещё раз или откройте ролик по ссылке.'));
      };
      window.onYouTubeIframeAPIReady = () => {
        clearTimeout(timer);
        if (typeof previous === 'function') previous();
        resolve(window.YT);
      };
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = fail;
      document.head.append(script);
    });
    return apiPromise;
  }

  for (const frame of frames) {
    const button = frame.querySelector('[data-youtube-toggle]');
    const status = frame.querySelector('[data-youtube-status]');
    const poster = frame.querySelector('.youtube-poster');
    const slot = frame.querySelector('[data-youtube-player]');
    const state = { visible: false, ready: false, loading: false, userPaused: false, requested: false, systemPause: false, player: null, failed: false };
    let readyTimer;
    const playingUI = (playing) => {
      button.textContent = playing ? 'Ⅱ Пауза' : '▶ Смотреть';
      button.setAttribute('aria-label', playing ? 'Приостановить видео' : 'Воспроизвести видео');
    };
    const fail = (message) => {
      clearTimeout(readyTimer);
      state.loading = false;
      state.ready = false;
      state.failed = true;
      state.player?.destroy();
      state.player = null;
      slot.replaceChildren();
      poster.hidden = false;
      status.textContent = message;
      button.disabled = false;
      button.textContent = '↻ Повторить';
      button.setAttribute('aria-label', 'Повторить загрузку YouTube');
    };
    const pause = () => {
      if (!state.ready) return;
      const current = state.player.getPlayerState();
      state.systemPause = current === 1 || current === 3;
      state.player.pauseVideo();
      playingUI(false);
    };
    const play = () => {
      if (!state.ready || !state.visible || document.hidden || state.userPaused) return;
      if (reducedMotion.matches && !state.requested) return;
      state.systemPause = false;
      state.player.mute();
      state.player.playVideo();
    };
    const initialize = async (fromUser = false) => {
      if (fromUser) { state.requested = true; state.userPaused = false; }
      if (state.ready) { play(); return; }
      if (state.loading) return;
      state.loading = true;
      state.failed = false;
      button.disabled = true;
      button.textContent = 'Подключаем…';
      status.textContent = 'Подключаем YouTube…';
      try {
        const YT = await loadAPI();
        const iframe = document.createElement('iframe');
        const params = new URLSearchParams({ enablejsapi: '1', origin: location.origin, playsinline: '1', controls: '1', loop: '1', playlist: frame.dataset.youtubeId, autoplay: '0', rel: '0' });
        iframe.src = 'https://www.youtube.com/embed/' + frame.dataset.youtubeId + '?' + params;
        iframe.title = frame.dataset.videoTitle + ' — видео на YouTube';
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        slot.replaceChildren(iframe);
        readyTimer = setTimeout(() => fail('Не удалось открыть плеер. Откройте видео на YouTube или повторите попытку.'), 20000);
        state.player = new YT.Player(iframe, { host: 'https://www.youtube.com', events: {
          onReady: () => {
            clearTimeout(readyTimer);
            state.loading = false;
            state.ready = true;
            button.disabled = false;
            playingUI(false);
            poster.hidden = true;
            status.textContent = reducedMotion.matches ? 'Автозапуск отключён: уменьшение движения.' : 'Видео процесса · без звука';
            play();
          },
          onStateChange: (event) => {
            if (event.data === 1) {
              if (!state.visible || document.hidden) { pause(); return; }
              state.userPaused = false;
              state.requested = false;
              playingUI(true);
              status.textContent = 'Видео процесса · YouTube';
            } else if (event.data === 2) {
              if (!state.systemPause && state.visible && !document.hidden) state.userPaused = true;
              state.systemPause = false;
              playingUI(false);
            } else if (event.data === 0) {
              playingUI(false);
            }
          },
          onAutoplayBlocked: () => {
            state.userPaused = true;
            playingUI(false);
            status.textContent = 'Браузер остановил автозапуск. Нажмите «Смотреть».';
          },
          onError: (event) => fail([100, 101, 150].includes(event.data)
            ? 'Ролик недоступен или автор запретил встраивание. Проверьте его на YouTube.'
            : 'YouTube не смог воспроизвести ролик. Откройте его по ссылке или повторите попытку.'),
        } });
      } catch (error) { fail(error.message); }
    };
    button.addEventListener('click', () => {
      if (state.ready && [1, 3].includes(state.player.getPlayerState())) {
        state.userPaused = true;
        state.requested = false;
        pause();
      } else initialize(true);
    });
    const observer = new IntersectionObserver(([entry]) => {
      state.visible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
      if (!state.visible) { state.requested = false; pause(); }
      else if (!state.userPaused && !reducedMotion.matches && !document.hidden && !state.failed) initialize();
    }, { threshold: [0, 0.2] });
    observer.observe(frame);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { state.requested = false; pause(); }
      else if (state.visible && !state.userPaused && !reducedMotion.matches && !state.failed) initialize();
    });
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) { state.requested = false; pause(); }
      else if (state.visible && !state.userPaused && !state.failed) initialize();
    });
    window.addEventListener('pagehide', pause);
    if (reducedMotion.matches) status.textContent = 'Автозапуск отключён: уменьшение движения.';
  }
})();
