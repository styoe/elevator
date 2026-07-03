# Chrome Web Store assets

Promotional images for the Elevator listing, sized to Chrome Web Store spec
(24-bit PNG, no alpha).

| File            | Size       | Web Store slot                          |
|-----------------|------------|-----------------------------------------|
| `screenshot.png`| 1280×800   | Screenshot (1–5 allowed; 1280×800 pref) |
| `cover.png`     | 1400×560   | Marquee promo tile ("cover")            |

The 128×128 store icon is already in `../icons/icon128.png`.

Both are rendered from the real UI: a self-contained mock of the side panel
that inlines `popup.css` and the real icon is screenshotted with headless
Chrome, then composed onto the marketing backgrounds. Regenerate with the
scripts in the session scratchpad (`gen_mock.py` → headless Chrome → `compose.py`)
if the UI or branding changes.

Not generated (optional): the 440×280 small promo tile — ask if you want it.
