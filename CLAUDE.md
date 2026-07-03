# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Tab BGM** — a Chrome Manifest V3 extension that plays background music *inside a chosen tab* so the audio is captured by Chrome's "Share tab audio" feature (Meet/Zoom/Discord). The core trick: Chrome shares audio from one tab at a time, so the extension injects a hidden player into that tab rather than playing from the popup or a background page.

There is **no build system, package manager, tests, or linter**. It is plain vanilla JS/HTML/CSS loaded directly by Chrome.

## Development workflow

- **Load/reload:** `chrome://extensions` → Developer mode → **Load unpacked** → select this folder. After editing files, click the reload icon on the extension card. Editing `content.js` also requires re-running the stage injection (reopen the popup and play/bind again) since the old injected instance stays in the page.
- **Debugging:** the popup has its own DevTools (right-click popup → Inspect); `content.js` logs to the **stage tab's** console; `background.js` logs to the service worker console (link on the extensions page).
- The stage tab cannot be a `chrome://`, `chrome-extension://`, `about:`, `edge://`, or Web Store page — `ensureStage()` rejects these.

## Architecture

Three isolated execution contexts that communicate only via `chrome.tabs.sendMessage` / `chrome.runtime.sendMessage` and shared `chrome.storage.local`:

- **`popup.js`** — the control panel and the *only* place with UI. Owns the playlist (IndexedDB) and settings (`chrome.storage.local`), and drives playback by sending command messages to the stage tab. Polls the stage for state every 500ms while open.
- **`content.js`** — the "stage." Injected on demand into the shared tab; owns the actual `<audio>` element or YouTube `<iframe>`. Guarded against double-injection via `window.__tabBgmStage`, so playback survives popup opens and re-injection. Lives in an off-screen (not `display:none`) container because hiding the iframe suspends YouTube playback.
- **`background.js`** — minimal service worker. Only job: clear the stored `stageTabId` when that tab closes. Has a reserved no-op `ended` listener for future background auto-advance.

### Key concept: the "stage" binding

`stageTabId` in `chrome.storage.local` records which tab is the stage. `ensureStage(forceCurrent)` in `popup.js` binds the active tab (or reuses the existing binding) and injects `content.js` via `chrome.scripting.executeScript`. All playback commands from `send(cmd, extra)` target `stageTabId`; if the message fails (tab gone / not injected) `send` returns `null` and the caller shows a toast.

### Message protocol (popup → content)

`content.js`'s `chrome.runtime.onMessage` listener is the command surface. Commands (`msg.cmd`): `load`, `play`, `pause`, `seek`, `volume`, `setLoop`, `state`, `stop`. `state` returns the content script's `state` object, which the popup polls to update the transport/seek UI. Content → popup uses a single `{ event: 'ended' }` message for auto-advance (only handled while the popup is open).

### Playback types

Tracks are `type: 'youtube'` or `type: 'audio'`. YouTube uses the iframe postMessage JSON API directly (no external YouTube script) — `ytPost(func, args)` sends commands, and a `window.message` handler parses `infoDelivery` events for time/duration/state. Audio uses a plain `<audio>` element.

### Storage split (important — two different stores)

- **IndexedDB** (`tab-bgm` DB, `tracks` store, keyPath `id`) — the playlist. Accessed only through the `idbAll/idbPut/idbDel/idbClear` helpers in `popup.js`. Uploaded local files are stored as **Blobs directly** in IndexedDB, then converted to data URLs at play time (`blobToDataURL`) because the injected content script can't read the popup's Blob references.
- **`chrome.storage.local`** — settings (`volume`, `loop`, `defaultTrackId`, `currentTrackId`) and the stage binding (`stageTabId`, `stageTabTitle`).

The **default** track (`defaultTrackId`, ⭐) is what the ▶ button plays when nothing is loaded, falling back to current → first track.

## Gotchas

- Auto-advance to the next track only fires while the popup is open (the popup owns the `ended` handler). Use loop for unattended playback.
- Autoplay may be blocked until the stage page receives a user gesture; a track can load silently until the user clicks the page.
- Strict-CSP sites (`frame-src`/`media-src`) can block the YouTube iframe or audio element in the stage tab. Bind a plain page instead.
- Remote audio URLs need CORS-permissive hosts (`audioEl.crossOrigin = 'anonymous'`).
