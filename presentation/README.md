# "Lifting the Veil" — Temporal Talk Materials

Slides for the ~25 minute talk **"Lifting the Veil: How to Match Your Use Case and Temporal"** —
the story of turning one vague prompt into this repo's insurance-claims demo, and what that teaches
about matching Temporal to a real use case.

## What's here

| Path | What it is |
| --- | --- |
| `slides/index.html` | **Primary deck.** Custom-styled reveal.js presentation. Use this to present live. |
| `Lifting-the-Veil-Temporal-Talk.pptx` | Editable PowerPoint backup with the same content/order — for last-minute edits, conference templates, or if a browser isn't an option. |
| `Lifting-the-Veil-Temporal-Talk.pdf` | Portable PDF export of the HTML deck (one slide per page) — a no-dependencies fallback. |
| `recordings/` | 7 real screen recordings (~4 min total, played at 0.5× speed for readability) captured against the actual running demo, referenced by the 6 "DEMO" slides + the bonus Web UI tour. |
| `assets/posters/` | Poster frames for each recording (also used as the video's paused/loading state). |
| `scripts/` | Tooling used to build/QA/export the deck, plus the Playwright recording harness (`scripts/record/`). |
| `pptx/build_pptx.py` | Regenerates the `.pptx` from scratch (python-pptx). |

## Presenting live (recommended)

```bash
cd presentation
npm install          # once
npm start             # serves the deck at http://localhost:8080
```

Open **http://localhost:8080/slides/index.html**, then:

- `F` — fullscreen · `→ / space` — next slide · `S` — speaker notes window (has your talking points
  and timing cues per slide)
- The deck is fully self-contained (reveal.js and every recording are vendored locally) — no
  internet required at the venue.
- Demo slides (`DEMO 1/6` … `DEMO 6/6`, plus the bonus Temporal Web UI tour) are real `<video>`
  embeds with a custom play/seek control bar (see "Video playback" below), each backed by an
  actual captured run of the live demo stack (not a mockup). Re-record any of them with
  `node scripts/record/0N-*.mjs` — see "Re-recording a demo" below.

## Video playback (custom controls)

The demo videos use a small custom control bar (`assets/js/video-controls.js`) instead of the
browser's native `<video controls>`, for two reasons found while presenting:

1. **reveal.js hijacks arrow keys.** Its global keyboard handler only excludes `<input>`/`<textarea>`
   from triggering slide navigation — it does not exclude `<video>` — so pressing → to seek a
   focused native scrubber changed the *slide* instead. The custom seek bar stops its own keydown
   events from bubbling up to reveal.js, so arrow keys seek the video as expected.
2. **Seeking requires a Range-capable static server.** `npm start` now runs `http-server` (added as
   a devDependency) instead of `python3 -m http.server`, which does not honor `Range` request
   headers at all — every seek attempt silently failed because the browser could never fetch a
   byte range beyond what had already streamed in order. If you serve this folder with something
   else, confirm it returns `206 Partial Content` for a ranged request, or skip/rewind will look
   broken again regardless of the control bar.

The bar supports click-to-seek, drag-to-seek, play/pause, arrow-key seeking (±5s), a time/duration
readout, and fullscreen — full details in the script's header comment.

## Re-recording a demo

Each `scripts/record/0N-*.mjs` script drives the **real** running stack (Temporal dev server,
worker, API, and the Vite dashboard) with Playwright, records real video, and transcodes it to
`recordings/0N-*.mp4` via ffmpeg. To redo one:

```bash
# 1. Start the full demo stack from the repo root (separate terminal / another shell)
cd .. && npm run dev

# 2. From presentation/, re-run the recording script for the demo you want
cd presentation
node scripts/record/05-worker-restart-durability.mjs

# 3. Slow it to 0.5x speed (all recordings in this deck play at half speed for readability)
ffmpeg -y -i recordings/05-worker-restart-durability.mp4 -filter:v "setpts=2.0*PTS" \
  -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -movflags +faststart \
  /tmp/slowed.mp4 && mv /tmp/slowed.mp4 recordings/05-worker-restart-durability.mp4

# 4. Regenerate a poster frame (pick a timestamp that shows the interesting moment)
ffmpeg -y -ss 21 -i recordings/05-worker-restart-durability.mp4 \
  -frames:v 1 -q:v 3 assets/posters/05-worker-restart-durability.jpg
```

Requires a full `ffmpeg` build with libx264 (`brew install ffmpeg`) — the ffmpeg bundled with
Playwright is a stripped-down webm/vp8-only build and can't produce the `.mp4` files the deck uses.

**If a step types text on camera**, use Playwright's `locator.pressSequentially(text, { delay: 45 })`
instead of `.fill()`. `.fill()` sets the value instantly, which reads as a jump-cut once slowed down
and gives the audience nothing to read. `pressSequentially` types character-by-character, and should
be followed by a ~2–3s pause on the completed text before clicking the next button.

**For any on-camera scroll or click**, use the `record-helpers.mjs` helpers instead of Playwright's
raw APIs, so the audience can actually follow the action:

- `smoothScrollTo(page, locator)` — replaces `locator.scrollIntoViewIfNeeded()`, which jumps
  instantly. This scrolls with a native smooth animation instead.
- `clickWithEmphasis(page, locator)` — replaces `locator.click()`. Moves a small fake cursor overlay
  to the element with a visible glide, flashes a click ripple, then performs the real click. Without
  this, Playwright's synthetic clicks are invisible on screen and a viewer can't tell what was
  pressed. Call `installCursorOverlay(page)` once per recording before using it.

See `scripts/record/02-human-review-signals.mjs` for the reference pattern combining all of these.

## Demo recordings reference

All recordings play at **0.5× speed** (the source capture is double-speed relative to these
durations) so the audience has time to read the UI as it updates.

| File | Duration | Slide | Shows |
| --- | --- | --- | --- |
| `01-submit-and-progress.mp4` | 0:24 | Demo 1/6 | Submitting via the real form (emphasized click); live stage timeline via polling |
| `02-human-review-signals.mp4` | 0:56 | Demo 2/6 | Indefinite wait signal; request-info ↔ provide-info round trip (typed on camera at a readable pace, smooth scroll, emphasized clicks); approve → paid |
| `03-transient-retry.mp4` | 0:23 | Demo 3/6 | Live attempt counter climbing on a retry policy, zero custom retry code |
| `04-permanent-failure-recovery.mp4` | 0:35 | Demo 4/6 | Non-retryable failure parks the workflow; UI-driven recovery signal (smooth scroll, emphasized clicks) |
| `05-worker-restart-durability.mp4` | 1:14 | Demo 5/6 | **The centerpiece** — kill & restart the real worker process mid-claim; state survives (smooth scroll, emphasized clicks) |
| `06-cancellation-saga.mp4` | 0:24 | Demo 6/6 | Cancellation triggers saga-style compensations, visible in the event log (emphasized click) |
| `07-temporal-web-ui-tour.mp4` | 0:33 | Bonus | Search-attribute query, live `getClaimState` query, the fraud child workflow — all in Temporal's own Web UI (emphasized clicks) |

All 7 were captured against the real running stack (no staging/mocking) — worker generations,
timestamps and query results in the videos are genuine. All 7 now use the smooth-scroll/
click-emphasis treatment described above (see `scripts/record/*.mjs`).

## Regenerating the PDF / pptx after editing the HTML deck

```bash
npm start &            # keep the local server running in the background
npm run qa             # screenshots every slide at native 1280x720 into qa-screenshots/ (gitignored)
npm run pdf            # exports Lifting-the-Veil-Temporal-Talk.pdf via reveal.js print-pdf mode
```

**Known limitation:** the 7 demo/video slides render with their poster image swapped in for print
(so they aren't literally blank video players), but in the current PDF export those poster images
don't paint in Chromium's print pipeline — those 7 pages show the title/badge/talking-points text
correctly with an empty video area. This only affects the PDF; the live HTML deck plays every
recording normally. If you need a fully visual PDF, take screenshots of those 7 slides from the
live deck (`npm run qa`) and manually composite, or just present live/share the HTML deck instead.

The `.pptx` is independent of the HTML (built with python-pptx, not a screenshot clone), so editing
`slides/index.html` does **not** auto-update it. To regenerate it after changing content:

```bash
python3 -m venv .venv && .venv/bin/pip install python-pptx pillow   # once
.venv/bin/python pptx/build_pptx.py
```

## Design notes

- Color palette and type intentionally mirror the claims-console app itself (deep navy background,
  purple/blue accent gradient, the same semantic status colors) so the talk and the live demo feel
  like one continuous visual world.
- `slides/theme.css` is a fully custom reveal.js theme (not one of the stock themes).
- Both the HTML deck and the pptx were checked for text overflow programmatically (a real bug class
  hit during authoring — see `scripts/shoot-slides.mjs` for the reveal.js QA harness). If you add
  new dense content (grids, long headings), re-run `npm run qa` and eyeball the screenshots before
  the talk.
