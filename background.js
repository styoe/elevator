// background.js — service worker.
// Keeps light state about which tab is currently the "stage" and cleans up
// when that tab is closed. Playback itself lives entirely in the content script.

// Open the UI in the side panel (not a popup) when the toolbar icon is clicked.
// A side panel stays open across focus changes, so its buttons keep working
// after you click into another window and back.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { stageTabId } = await chrome.storage.local.get('stageTabId');
  if (stageTabId === tabId) {
    await chrome.storage.local.remove(['stageTabId', 'stageTabTitle']);
  }
});

// Optional: relay "ended" events (from content.js) — currently the popup
// handles auto-advance while it is open. This listener just swallows the
// message so it doesn't error when no popup is listening.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.event === 'ended') {
    // no-op; reserved for future background auto-advance
  }
});
