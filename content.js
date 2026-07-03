// content.js — the in-tab "stage".
// This runs inside the shared tab and owns the actual audio/YouTube player,
// so whatever it plays is captured by Chrome's tab-audio sharing.
// The popup drives it via chrome.tabs.sendMessage.

(() => {
  // Guard against re-injection: keep playing across popup opens / re-injects.
  if (window.__tabBgmStage) return;
  window.__tabBgmStage = true;

  const state = {
    type: null,        // 'audio' | 'youtube'
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: 100,       // 0-100
    title: '',
    loop: false,
    ready: false,
  };

  // Off-screen container. We position it off-screen instead of display:none
  // because a display:none iframe can suspend YouTube playback.
  const wrap = document.createElement('div');
  wrap.id = '__tab_bgm_wrap';
  wrap.style.cssText =
    'position:fixed;left:-10000px;top:-10000px;width:320px;height:180px;' +
    'overflow:hidden;z-index:-2147483648;pointer-events:none;opacity:0.01;';
  (document.documentElement || document.body).appendChild(wrap);

  let audioEl = null;
  let ytFrame = null;

  function clearStage() {
    wrap.innerHTML = '';
    audioEl = null;
    ytFrame = null;
    state.ready = false;
    state.currentTime = 0;
    state.duration = 0;
    state.playing = false;
  }

  function notifyEnded() {
    try {
      chrome.runtime.sendMessage({ event: 'ended' });
    } catch (e) {
      /* popup/background may be closed — that's fine */
    }
  }

  // ---------- Plain audio (mp3 / wav / any <audio> src) ----------
  function loadAudio(src, volume, autoplay) {
    clearStage();
    state.type = 'audio';
    audioEl = document.createElement('audio');
    audioEl.crossOrigin = 'anonymous';
    audioEl.preload = 'auto';
    audioEl.src = src;
    audioEl.volume = clampVol(volume) / 100;

    audioEl.addEventListener('timeupdate', () => {
      state.currentTime = audioEl.currentTime || 0;
      state.duration = isFinite(audioEl.duration) ? audioEl.duration : 0;
    });
    audioEl.addEventListener('loadedmetadata', () => {
      state.duration = isFinite(audioEl.duration) ? audioEl.duration : 0;
      state.ready = true;
    });
    audioEl.addEventListener('play', () => (state.playing = true));
    audioEl.addEventListener('pause', () => (state.playing = false));
    audioEl.addEventListener('ended', () => {
      if (state.loop) {
        audioEl.currentTime = 0;
        audioEl.play().catch(() => {});
      } else {
        state.playing = false;
        notifyEnded();
      }
    });

    wrap.appendChild(audioEl);
    if (autoplay) tryPlayAudio();
  }

  function tryPlayAudio() {
    if (!audioEl) return;
    audioEl.play().catch((e) => {
      // Autoplay may be blocked until the page gets a gesture.
      console.warn('[Tab BGM] audio play blocked:', e && e.message);
      state.playing = false;
    });
  }

  // ---------- YouTube (via iframe postMessage API, no external script) ----------
  function ytPost(func, args) {
    if (!ytFrame || !ytFrame.contentWindow) return;
    ytFrame.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func, args: args || [] }),
      '*'
    );
  }

  function loadYouTube(videoId, volume, autoplay) {
    clearStage();
    state.type = 'youtube';
    ytFrame = document.createElement('iframe');
    const params = new URLSearchParams({
      enablejsapi: '1',
      autoplay: autoplay ? '1' : '0',
      controls: '1',
      playsinline: '1',
      rel: '0',
      origin: location.origin,
    });
    ytFrame.src = `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
    ytFrame.width = '320';
    ytFrame.height = '180';
    ytFrame.setAttribute('frameborder', '0');
    ytFrame.allow =
      'autoplay; encrypted-media; accelerometer; gyroscope; picture-in-picture';

    ytFrame.addEventListener('load', () => {
      // Handshake so the player starts posting infoDelivery events back to us.
      try {
        ytFrame.contentWindow.postMessage(
          JSON.stringify({ event: 'listening', id: 'tabbgm', channel: 'widget' }),
          '*'
        );
      } catch (e) {}
      setTimeout(() => {
        ytPost('setVolume', [clampVol(volume)]);
        if (autoplay) ytPost('playVideo');
        state.ready = true;
      }, 400);
    });

    wrap.appendChild(ytFrame);
  }

  // Receive state updates from the YouTube iframe.
  window.addEventListener('message', (e) => {
    if (state.type !== 'youtube') return;
    if (typeof e.data !== 'string') return;
    let data;
    try {
      data = JSON.parse(e.data);
    } catch (_) {
      return;
    }
    const info = data && data.info;
    if (!info) return;
    if (typeof info.currentTime === 'number') state.currentTime = info.currentTime;
    if (typeof info.duration === 'number' && info.duration > 0)
      state.duration = info.duration;
    if (typeof info.volume === 'number') state.volume = info.volume;
    if (typeof info.playerState === 'number') {
      state.playing = info.playerState === 1; // 1 = playing
      if (info.playerState === 0) {
        // ended
        if (state.loop) {
          ytPost('seekTo', [0, true]);
          ytPost('playVideo');
        } else {
          notifyEnded();
        }
      }
    }
  });

  function clampVol(v) {
    v = Number(v);
    if (isNaN(v)) return 100;
    return Math.max(0, Math.min(100, v));
  }

  // ---------- Command handler from popup ----------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg && msg.cmd) {
      case 'load':
        state.title = msg.title || '';
        state.loop = !!msg.loop;
        state.volume = clampVol(msg.volume);
        if (msg.payload.type === 'youtube') {
          loadYouTube(msg.payload.videoId, state.volume, msg.autoplay);
        } else {
          loadAudio(msg.payload.src, state.volume, msg.autoplay);
        }
        sendResponse({ ok: true });
        break;

      case 'play':
        if (state.type === 'youtube') ytPost('playVideo');
        else tryPlayAudio();
        sendResponse({ ok: true });
        break;

      case 'pause':
        if (state.type === 'youtube') ytPost('pauseVideo');
        else if (audioEl) audioEl.pause();
        sendResponse({ ok: true });
        break;

      case 'seek':
        if (state.type === 'youtube') ytPost('seekTo', [msg.time, true]);
        else if (audioEl) audioEl.currentTime = msg.time;
        state.currentTime = msg.time;
        sendResponse({ ok: true });
        break;

      case 'volume':
        state.volume = clampVol(msg.value);
        if (state.type === 'youtube') ytPost('setVolume', [state.volume]);
        else if (audioEl) audioEl.volume = state.volume / 100;
        sendResponse({ ok: true });
        break;

      case 'setLoop':
        state.loop = !!msg.value;
        sendResponse({ ok: true });
        break;

      case 'state':
        sendResponse({ state });
        break;

      case 'stop':
        clearStage();
        state.type = null;
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ ok: false, error: 'unknown command' });
    }
    return true; // keep the message channel open for async sendResponse
  });

  console.log('[Tab BGM] stage ready in this tab');
})();
