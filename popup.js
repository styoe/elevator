// popup.js — the control UI. Manages the playlist (IndexedDB), settings
// (chrome.storage.local), and drives the in-tab player via messages.

/* ============================ IndexedDB ============================ */
const DB_NAME = 'tab-bgm';
const STORE = 'tracks';
let _dbPromise = null;

function db() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function idbAll() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(track) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(track);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDel(id) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbClear() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ============================ Settings ============================ */
async function getSettings() {
  const s = await chrome.storage.local.get({
    volume: 80,
    loop: false,
    defaultTrackId: null,
    currentTrackId: null,
    defaultsSeeded: false,
  });
  return s;
}
async function setSettings(patch) {
  await chrome.storage.local.set(patch);
}

/* ============================ Helpers ============================ */
function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function parseYouTubeId(input) {
  if (!input) return null;
  input = input.trim();
  // Bare 11-char id
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  try {
    const u = new URL(input);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[2];
  } catch (_) {
    const m = input.match(/[a-zA-Z0-9_-]{11}/);
    if (m) return m[0];
  }
  return null;
}

function fmtTime(sec) {
  sec = Math.floor(sec || 0);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

/* ============================ Stage (tab) plumbing ============================ */
async function ensureStage(forceCurrent) {
  let { stageTabId } = await chrome.storage.local.get('stageTabId');

  if (forceCurrent || !stageTabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab.');
    if (/^(chrome|edge|about|chrome-extension|https:\/\/chromewebstore)/.test(tab.url || '')) {
      throw new Error('Cannot play in this page (chrome:// or Web Store). Open a normal website tab.');
    }
    stageTabId = tab.id;
    await chrome.storage.local.set({ stageTabId, stageTabTitle: tab.title || 'tab ' + tab.id });
  }

  // Inject the stage (guarded against double-init inside content.js).
  await chrome.scripting.executeScript({
    target: { tabId: stageTabId },
    files: ['content.js'],
  });

  return stageTabId;
}

async function send(cmd, extra) {
  const { stageTabId } = await chrome.storage.local.get('stageTabId');
  if (!stageTabId) return null;
  try {
    return await chrome.tabs.sendMessage(stageTabId, { cmd, ...(extra || {}) });
  } catch (e) {
    return null; // content script not present / tab gone
  }
}

/* ============================ Rendering ============================ */
let tracks = [];
let seeking = false;

async function loadTracks() {
  tracks = await idbAll();
  tracks.sort((a, b) => a.createdAt - b.createdAt);
}

async function renderPlaylist() {
  const { defaultTrackId, currentTrackId } = await getSettings();
  const ul = document.getElementById('playlist');
  const empty = document.getElementById('emptyMsg');
  ul.innerHTML = '';
  empty.classList.toggle('hidden', tracks.length > 0);

  for (const t of tracks) {
    const li = document.createElement('li');
    li.className = 'pl-item' + (t.id === currentTrackId ? ' playing' : '');

    const badge = document.createElement('span');
    badge.className = 'pl-badge ' + (t.type === 'youtube' ? 'yt' : 'audio');
    badge.textContent = t.type === 'youtube' ? 'YT' : (t.isFile ? 'FILE' : 'URL');

    const info = document.createElement('div');
    info.className = 'pl-info';
    const name = document.createElement('div');
    name.className = 'pl-name';
    name.textContent = t.title || '(untitled)';
    info.appendChild(name);

    const actions = document.createElement('div');
    actions.className = 'pl-actions';

    const star = document.createElement('button');
    star.className = 'icon-btn star' + (t.id === defaultTrackId ? ' on' : '');
    star.title = 'Set as default';
    star.textContent = t.id === defaultTrackId ? '★' : '☆';
    star.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cur = (await getSettings()).defaultTrackId;
      await setSettings({ defaultTrackId: cur === t.id ? null : t.id });
      renderPlaylist();
      toast(cur === t.id ? 'Default cleared' : 'Default set: ' + (t.title || ''));
    });

    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.title = 'Remove';
    del.textContent = '🗑';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await idbDel(t.id);
      const s = await getSettings();
      const patch = {};
      if (s.defaultTrackId === t.id) patch.defaultTrackId = null;
      if (s.currentTrackId === t.id) patch.currentTrackId = null;
      if (Object.keys(patch).length) await setSettings(patch);
      await loadTracks();
      renderPlaylist();
    });

    actions.appendChild(star);
    actions.appendChild(del);

    li.appendChild(badge);
    li.appendChild(info);
    li.appendChild(actions);
    li.addEventListener('click', () => playTrack(t));
    ul.appendChild(li);
  }
}

async function renderStageStatus() {
  const { stageTabId, stageTabTitle } = await chrome.storage.local.get([
    'stageTabId',
    'stageTabTitle',
  ]);
  const el = document.getElementById('stageStatus');
  if (stageTabId) {
    el.textContent = '▶ ' + (stageTabTitle || 'tab ' + stageTabId);
    el.classList.add('active');
  } else {
    el.textContent = 'No tab selected';
    el.classList.remove('active');
  }
}

function showPlayer(track) {
  document.getElementById('player').classList.remove('hidden');
  document.getElementById('npTitle').textContent = track
    ? track.title || '(untitled)'
    : 'Nothing playing';
}

/* ============================ Playback ============================ */
async function playTrack(track) {
  let tabId;
  try {
    // Always play in whatever tab is currently active.
    tabId = await ensureStage(true);
  } catch (e) {
    toast(e.message);
    return;
  }

  const { volume, loop } = await getSettings();

  let payload;
  if (track.type === 'youtube') {
    payload = { type: 'youtube', videoId: track.videoId };
  } else {
    let src = track.url;
    if (track.isFile && track.blob) {
      src = await blobToDataURL(track.blob);
    }
    payload = { type: 'audio', src };
  }

  const res = await send('load', {
    payload,
    title: track.title,
    volume,
    loop,
    autoplay: true,
  });

  if (res == null) {
    toast('Could not reach the tab. Open a normal website tab and try again.');
    return;
  }

  await setSettings({ currentTrackId: track.id });
  showPlayer(track);
  renderPlaylist();
  await renderStageStatus();
  updatePlayButton(true);
  toast('Playing in this tab ▶');
}

function currentIndex(currentTrackId) {
  return tracks.findIndex((t) => t.id === currentTrackId);
}

async function playAdjacent(delta) {
  if (!tracks.length) return;
  const { currentTrackId } = await getSettings();
  let idx = currentIndex(currentTrackId);
  if (idx < 0) idx = 0;
  else idx = (idx + delta + tracks.length) % tracks.length;
  await playTrack(tracks[idx]);
}

function updatePlayButton(playing) {
  document.getElementById('playBtn').textContent = playing ? '⏸' : '▶';
}

/* ============================ Volume animation ============================ */
let volAnim = null;
function cancelVolAnim() {
  if (volAnim) {
    clearInterval(volAnim);
    volAnim = null;
  }
}

// Update slider + label + push to the tab. persist=true also writes settings.
async function applyVolumeUI(v, persist) {
  const vol = document.getElementById('volume');
  vol.value = v;
  document.getElementById('volVal').textContent = v;
  send('volume', { value: v });
  if (persist) await setSettings({ volume: v });
}

// Smoothly ramp the volume to `target` over `durationMs` (~50ms steps).
function animateVolume(target, durationMs) {
  cancelVolAnim();
  const start = Number(document.getElementById('volume').value) || 0;
  const delta = target - start;
  if (durationMs <= 0 || delta === 0) {
    applyVolumeUI(target, true);
    return;
  }
  const t0 = performance.now();
  volAnim = setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / durationMs);
    if (p >= 1) {
      cancelVolAnim();
      applyVolumeUI(target, true);
    } else {
      applyVolumeUI(Math.round(start + delta * p), false); // don't spam settings every tick
    }
  }, 50);
}

/* ============================ State polling ============================ */
let pollTimer = null;
function startPolling() {
  stopPolling();
  pollTimer = setInterval(refreshState, 500);
  refreshState();
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function refreshState() {
  const res = await send('state');
  if (!res || !res.state) return;
  const st = res.state;

  updatePlayButton(st.playing);

  const dur = st.duration || 0;
  document.getElementById('durTime').textContent = fmtTime(dur);
  document.getElementById('curTime').textContent = fmtTime(st.currentTime);

  if (!seeking) {
    const seek = document.getElementById('seek');
    seek.max = dur > 0 ? Math.floor(dur) : 1000;
    seek.value = Math.floor(st.currentTime || 0);
  }
}

/* ============================ Wiring ============================ */
function wireTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const which = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((p) =>
        p.classList.toggle('active', p.dataset.panel === which)
      );
    });
  });
}

async function addYouTube() {
  const url = document.getElementById('ytUrl').value;
  const videoId = parseYouTubeId(url);
  if (!videoId) {
    toast('Could not parse a YouTube video ID.');
    return;
  }
  const title = document.getElementById('ytTitle').value.trim() || 'YouTube: ' + videoId;
  await idbPut({ id: uid(), type: 'youtube', videoId, title, createdAt: Date.now() });
  document.getElementById('ytUrl').value = '';
  document.getElementById('ytTitle').value = '';
  await loadTracks();
  renderPlaylist();
  toast('Added: ' + title);
}

async function addUrl() {
  const url = document.getElementById('audUrl').value.trim();
  if (!url) {
    toast('Enter an audio URL.');
    return;
  }
  const title =
    document.getElementById('audTitle').value.trim() ||
    decodeURIComponent(url.split('/').pop() || 'audio');
  await idbPut({
    id: uid(),
    type: 'audio',
    url,
    isFile: false,
    title,
    createdAt: Date.now(),
  });
  document.getElementById('audUrl').value = '';
  document.getElementById('audTitle').value = '';
  await loadTracks();
  renderPlaylist();
  toast('Added: ' + title);
}

async function addFiles() {
  const input = document.getElementById('audFile');
  const files = Array.from(input.files || []);
  if (!files.length) {
    toast('Choose one or more audio files.');
    return;
  }
  let n = 0;
  for (const f of files) {
    await idbPut({
      id: uid(),
      type: 'audio',
      isFile: true,
      blob: f, // IndexedDB stores Blobs directly
      title: f.name,
      createdAt: Date.now() + n,
    });
    n++;
  }
  input.value = '';
  await loadTracks();
  renderPlaylist();
  toast('Added ' + n + ' file(s)');
}

// Default playlist, seeded once on first launch (all YouTube).
const DEFAULT_TRACKS = [
  { videoId: 'TyCKqRvCN8E', title: 'The Prodigy — Funky Shit' },
  { videoId: 'MbKNwOIB2Ps', title: 'Cowboy Bebop — Soundtrack (Full Album)' },
  { videoId: 'dVNdTXEJv1A', title: 'All Saints — Pure Shores' },
  { videoId: 'mNjmGuJY5OE', title: 'Orbital — Halcyon and On and On' },
  { videoId: 'nZXRV4MezEw', title: 'Cher — Believe' },
];

async function seedDefaults() {
  const { defaultsSeeded } = await getSettings();
  if (defaultsSeeded) return;

  const base = Date.now();
  let firstId = null;
  for (let i = 0; i < DEFAULT_TRACKS.length; i++) {
    const t = DEFAULT_TRACKS[i];
    const id = uid();
    if (i === 0) firstId = id;
    await idbPut({
      id,
      type: 'youtube',
      videoId: t.videoId,
      title: t.title,
      createdAt: base + i, // preserve listed order
    });
  }

  // Mark seeded so we never re-add (even if the user later clears the list),
  // and make the first track (Prodigy) the default that ▶ plays.
  await setSettings({ defaultsSeeded: true, defaultTrackId: firstId });
}

// One-time fixes for already-seeded playlists (seeding only runs on first
// launch, so existing installs need their default entries updated). Maps an
// old videoId to its replacement; covers installs at any prior seedVersion.
async function runMigrations() {
  const CURRENT = 3;
  const { seedVersion } = await chrome.storage.local.get({ seedVersion: 1 });
  if (seedVersion >= CURRENT) return;

  const REPLACE = {
    // Gladiator: original upload was deleted (404), and it's since been
    // replaced by request — map both the original and the v2 fill-in.
    YFwNx3BEGVY: { videoId: 'dVNdTXEJv1A', title: 'All Saints — Pure Shores' },
    iv8rfkuMn7U: { videoId: 'dVNdTXEJv1A', title: 'All Saints — Pure Shores' },
    // Orbital: use the official "Halcyon and On and On" audio.
    xFAwPUFuMfI: { videoId: 'mNjmGuJY5OE', title: 'Orbital — Halcyon and On and On' },
    // The Beach soundtrack replaced by request.
    'l7-c_QYGmt0': { videoId: 'nZXRV4MezEw', title: 'Cher — Believe' },
  };

  const all = await idbAll();
  for (const t of all) {
    const r = REPLACE[t.videoId];
    if (r) {
      t.videoId = r.videoId;
      t.title = r.title;
      await idbPut(t);
    }
  }
  await setSettings({ seedVersion: CURRENT });
}

async function init() {
  wireTabs();
  await seedDefaults();
  await runMigrations();
  await loadTracks();
  await renderPlaylist();
  await renderStageStatus();

  const { volume, loop, currentTrackId } = await getSettings();

  // Volume
  const vol = document.getElementById('volume');
  vol.value = volume;
  document.getElementById('volVal').textContent = volume;
  vol.addEventListener('input', async () => {
    cancelVolAnim(); // manual drag overrides any running fade
    document.getElementById('volVal').textContent = vol.value;
    await setSettings({ volume: Number(vol.value) });
    send('volume', { value: Number(vol.value) });
  });

  // Volume automation
  document.getElementById('fadeBtn').addEventListener('click', () => animateVolume(0, 4000));
  document.getElementById('speakBtn').addEventListener('click', () => animateVolume(8, 800));
  document.getElementById('playVolBtn').addEventListener('click', async () => {
    const res = await send('state');
    if (!res || !res.state || !res.state.type) {
      // Nothing loaded — start current/default/first at 90%.
      const { currentTrackId, defaultTrackId } = await getSettings();
      const t =
        tracks.find((x) => x.id === currentTrackId) ||
        tracks.find((x) => x.id === defaultTrackId) ||
        tracks[0];
      if (!t) {
        toast('Playlist is empty.');
        return;
      }
      await setSettings({ volume: 90 }); // playTrack loads at settings.volume
      await playTrack(t);
      await applyVolumeUI(90, true); // reflect 90 in the slider
      return;
    }
    if (!res.state.playing) {
      send('play');
      updatePlayButton(true);
    }
    animateVolume(90, 800);
  });

  // Loop
  const loopBtn = document.getElementById('loopBtn');
  loopBtn.classList.toggle('on', loop);
  loopBtn.addEventListener('click', async () => {
    const cur = (await getSettings()).loop;
    const next = !cur;
    await setSettings({ loop: next });
    loopBtn.classList.toggle('on', next);
    send('setLoop', { value: next });
    toast(next ? 'Loop on' : 'Loop off');
  });

  // Transport
  document.getElementById('playBtn').addEventListener('click', async () => {
    const res = await send('state');
    if (!res || !res.state || !res.state.type) {
      // Nothing loaded yet — play current/default/first.
      const { currentTrackId, defaultTrackId } = await getSettings();
      const t =
        tracks.find((x) => x.id === currentTrackId) ||
        tracks.find((x) => x.id === defaultTrackId) ||
        tracks[0];
      if (t) playTrack(t);
      else toast('Playlist is empty.');
      return;
    }
    if (res.state.playing) {
      send('pause');
      updatePlayButton(false);
    } else {
      send('play');
      updatePlayButton(true);
    }
  });

  document.getElementById('prevBtn').addEventListener('click', () => playAdjacent(-1));
  document.getElementById('nextBtn').addEventListener('click', () => playAdjacent(1));
  document.getElementById('stopBtn').addEventListener('click', async () => {
    await send('stop');
    updatePlayButton(false);
    await setSettings({ currentTrackId: null });
    document.getElementById('seek').value = 0;
    document.getElementById('curTime').textContent = '0:00';
    renderPlaylist();
  });

  // Seek
  const seek = document.getElementById('seek');
  seek.addEventListener('input', () => {
    seeking = true;
    document.getElementById('curTime').textContent = fmtTime(Number(seek.value));
  });
  seek.addEventListener('change', () => {
    send('seek', { time: Number(seek.value) });
    seeking = false;
  });

  // Add buttons
  document.getElementById('addYt').addEventListener('click', addYouTube);
  document.getElementById('addUrl').addEventListener('click', addUrl);
  document.getElementById('addFile').addEventListener('click', addFiles);
  document.getElementById('clearAll').addEventListener('click', async () => {
    await idbClear();
    await setSettings({ currentTrackId: null, defaultTrackId: null });
    await loadTracks();
    renderPlaylist();
    toast('Playlist cleared');
  });

  // Show player if something is (or was) current.
  if (currentTrackId) {
    const t = tracks.find((x) => x.id === currentTrackId);
    if (t) showPlayer(t);
  }

  // Auto-advance when a track ends (only while popup is open).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.event === 'ended') playAdjacent(1);
  });

  startPolling();
}

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('unload', stopPolling);
