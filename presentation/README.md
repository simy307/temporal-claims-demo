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
| `recordings/` | Demo screen recordings referenced by the 6 "DEMO" slides (see below). |
| `scripts/` | Tooling used to build/QA/export the deck. |
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
- The deck is fully self-contained (reveal.js is vendored in `node_modules/`) — no internet
  required at the venue.
- Demo slides (`DEMO 1/6` … `DEMO 6/6`, plus the bonus Temporal Web UI tour) are video cut-ins.
  Drop the corresponding files into `recordings/` (see filenames on each slide) and they'll play
  inline — see `slides/index.html` search for `demo-video-frame` if you want to swap the
  placeholder markup for a real `<video>` tag once recordings exist.

## Regenerating the PDF / pptx after editing the HTML deck

```bash
npm start &            # keep the local server running in the background
npm run qa             # screenshots every slide at native 1280x720 into qa-screenshots/ (gitignored)
npm run pdf            # exports Lifting-the-Veil-Temporal-Talk.pdf via reveal.js print-pdf mode
```

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
