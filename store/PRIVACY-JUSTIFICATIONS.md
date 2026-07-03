# Chrome Web Store — Privacy practices answers

Copy each block into the matching field on the **Privacy practices** tab, then
tick the data‑usage compliance certifications and **Save draft**.

## Single purpose
Elevator plays background music inside a browser tab you choose, so the music is
captured by Chrome's "share tab audio" and rides along when you share that tab in
a video call (Google Meet, Zoom, Discord, etc.). It provides a side‑panel control
surface with a playlist, transport controls, and volume automation (fade out, duck
for speaking, and boost).

## activeTab
When you start playback, Elevator injects its hidden audio/YouTube player into the
currently active tab — the tab you intend to share. activeTab provides access to
that tab so the music plays inside it and is captured by tab‑audio sharing.

## Host permissions (<all_urls>)
You can pick any website tab as the "stage" where music plays, so the player
content script must be injectable into any http/https page. Host access is used
solely to inject and run the in‑page audio/YouTube player in the tab you select.
Elevator does not read, collect, or transmit the content of any page.

## Remote code
Elevator only plays media the user adds. For YouTube tracks it embeds the official
YouTube IFrame player (https://www.youtube.com/embed/…); for other tracks it plays
audio from user‑provided URLs or local files. It does not download or execute any
remote JavaScript inside the extension's own pages — all extension logic ships in
the package. The only remotely hosted code involved is YouTube's standard embedded
player, used strictly for playback of tracks the user chooses.

## scripting
Used with chrome.scripting.executeScript to inject the player content script
(content.js) into the chosen tab at playback time. This is the mechanism that
places the audio element / YouTube player inside that tab so its sound is captured
when the tab is shared.

## sidePanel
The entire interface (playlist, transport controls, volume automation) lives in a
side panel instead of a popup, so the controls stay open and clickable while you
switch to your meeting window. The sidePanel permission opens this panel when the
toolbar icon is clicked.

## storage
chrome.storage.local stores the user's own preferences (volume, loop, default
track, current track) and a reference to which tab is currently the playback
"stage." The playlist itself is kept in the browser's local IndexedDB. No personal
data is stored and nothing is sent off the device.

## tabs
Used to (a) identify the active tab to play in and show its title in the panel,
(b) send playback commands to the player running in that tab via
chrome.tabs.sendMessage, and (c) detect when the stage tab is closed
(chrome.tabs.onRemoved) to clean up. Tab URLs are only inspected to block playback
on restricted pages such as chrome:// and the Web Store.

## Data usage / compliance
Elevator does not collect or transmit any user data. All settings and playlist
data stay on the user's device; there are no analytics, no accounts, and no
network calls other than fetching the media the user chose to play.
- Data collection disclosure: select **"does not collect"** for every category.
- Certify all three compliance statements (single purpose, limited/authorized use,
  data handling complies with the Developer Program Policies).
