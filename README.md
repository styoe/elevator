# Tab BGM — Background Music for Shared Tabs

Chrome shares audio from **one tab at a time**. This extension plays music
*inside* the tab you choose, so that music rides along whenever you share that
tab's audio in Google Meet, Zoom, Discord, etc.

It supports:

- 🎬 **YouTube** embeds (paste a URL or video ID)
- 🌐 **Audio URLs** (`.mp3`, `.wav`, or any streamable audio link)
- 📁 **Local files** you upload (`.mp3`, `.wav`, …) stored in the extension
- 🔊 Volume control
- ⏱️ Seek / navigate within the track
- ⏮️ ⏭️ Prev / next, 🔁 loop, ⏹️ stop
- ⭐ A **playlist** with a settable **default** track

## How it works

- The **popup** is the control panel (playlist, add tracks, transport, volume).
- When you play, the extension injects a hidden player (`content.js`) into the
  **stage tab** — the tab that will carry the sound.
- Because the player lives *in that tab*, the sound is captured by Chrome's
  "Share tab audio".

## Install (unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select this folder
   (`/home/led/Desktop/work/ai/elevator`).
4. Pin **Tab BGM** to the toolbar.

## Use it

1. Go to the tab you plan to **share** (any normal website — not
   `chrome://` pages or the Web Store).
2. Click the **Tab BGM** icon → **🎯 Use current tab as the stage**.
   (Playing a track also binds the current tab automatically the first time.)
3. Add tracks (YouTube / URL / file) and click a track to play it, or hit ▶.
4. In your meeting, choose **Share a tab** → pick the **stage tab** → enable
   **Also share tab audio**. Your music is now in the shared audio.

Click ⭐ on a track to mark it the **default** — the ▶ button plays the
default (or the current, or the first track) when nothing is loaded.

## Notes & caveats

- **Autoplay:** Chrome may block sound from starting until the stage page has
  received a user gesture. If a track loads but stays silent, click anywhere on
  the stage page once, then press ▶ in the popup. YouTube may briefly show its
  own controls in the (hidden) player — that's expected.
- **Which tab:** playback is tied to the tab you bound as the stage. If you
  switch tabs, music keeps playing in the stage tab (that's the point). If you
  **close** the stage tab, playback stops and you'll need to bind a new tab.
- **Auto-advance to the next track** happens only while the popup is open.
  Turn on 🔁 **loop** for uninterrupted background music when the popup closes.
- **Local files** are stored in the extension's IndexedDB and sent to the tab
  as data URLs at play time. Large files work but very large ones are slower.
- **CORS:** remote audio URLs must allow cross-origin playback; most public
  audio hosts and direct file links do.
- **Strict-CSP pages:** the player is injected into the stage tab's page, so a
  site with a restrictive Content-Security-Policy (`frame-src`/`media-src`) can
  block the YouTube iframe or audio element. If a track won't load on a locked-
  down site, make a plain page the stage instead — e.g. open `example.com` (or
  any simple site) in the tab you'll share, bind it, then share that tab.

## Files

| File           | Purpose                                             |
|----------------|-----------------------------------------------------|
| `manifest.json`| MV3 manifest                                        |
| `popup.html/.css/.js` | Control panel UI + playlist/settings logic   |
| `content.js`   | The in-tab player (audio element + YouTube iframe)  |
| `background.js`| Cleans up the stage binding when the tab closes     |
| `icons/`       | Toolbar icons                                       |
