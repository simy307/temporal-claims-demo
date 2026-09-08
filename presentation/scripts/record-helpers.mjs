// Shared helpers for recording short demo videos of the claims console against the REAL running
// stack (Temporal dev server + worker + API + Vite dev server). Produces real interactions, not
// staged screenshots — every recording is the actual app doing the actual thing.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const __dirname = dirname(fileURLToPath(import.meta.url));
export const RECORDINGS_DIR = join(__dirname, '..', 'recordings');
export const TMP_DIR = join(__dirname, '..', '.tmp-videos');
export const WEB_BASE = 'http://localhost:5173';
export const API_BASE = 'http://localhost:3000';

mkdirSync(RECORDINGS_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

/** Creates a claim directly via the API — used to skip past form-filling in demos 2-7 so each
 * clip stays focused on the capability it's illustrating, not a repeat of the submission form. */
export async function createClaim(overrides = {}) {
  const body = {
    policyNumber: 'POL-AUTO-4471',
    policyholder: 'Dana Whitfield',
    claimType: 'auto',
    incidentDate: new Date().toISOString().slice(0, 10),
    description: 'Rear-ended at a stoplight; bumper, trunk and tail lights damaged.',
    amount: 8400,
    contactEmail: 'dana.whitfield@example.com',
    paymentHoldSeconds: 10,
    reviewReminderSeconds: 600,
    ...overrides,
  };
  const response = await fetch(`${API_BASE}/api/claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`createClaim failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export async function getClaim(workflowId) {
  const response = await fetch(`${API_BASE}/api/claims/${encodeURIComponent(workflowId)}`);
  if (!response.ok) throw new Error(`getClaim failed: ${response.status}`);
  return response.json();
}

/** Polls the API (not the UI) until a predicate on the claim detail passes. */
export async function waitForClaim(workflowId, predicate, { timeoutMs = 60_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await getClaim(workflowId);
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitForClaim timed out. Last phase: ${last?.state?.phase}`);
}

/** Runs `fn(page)` inside a fresh, video-recorded browser context, then transcodes the result to
 * a shareable H.264 mp4 at recordings/<name>.mp4. */
export async function record(name, fn) {
  console.log(`\n=== recording ${name} ===`);
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: TMP_DIR, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  let videoPath;
  try {
    await fn(page, context);
  } finally {
    const video = page.video();
    await page.close();
    await context.close();
    await browser.close();
    videoPath = video ? await video.path() : null;
  }
  if (!videoPath || !existsSync(videoPath)) {
    throw new Error(`No video produced for ${name}`);
  }
  const outPath = join(RECORDINGS_DIR, `${name}.mp4`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i', videoPath,
      '-vf', 'scale=1280:720,format=yuv420p',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '19',
      '-movflags', '+faststart',
      outPath,
    ],
    { stdio: 'inherit' },
  );
  rmSync(videoPath, { force: true });
  console.log(`saved ${outPath}`);
  return outPath;
}

/** Small helper: sets the adjuster name in the header so signals in the recording look authored. */
export async function setAdjuster(page, name) {
  const input = page.getByPlaceholder('Your name');
  await input.fill(name);
}

export const pause = (page, ms) => page.waitForTimeout(ms);

/** Injects a small animated "fake cursor" + click-ripple overlay used to visually emphasize where
 * clicks land during recordings. Playwright's real input is synthetic and invisible on screen, so
 * without this a viewer has no idea what was just clicked. Call once per page/context. */
export async function installCursorOverlay(page) {
  await page.addStyleTag({
    content: `
      #__rec-cursor {
        position: fixed; top: 0; left: 0; width: 22px; height: 22px; margin: -11px 0 0 -11px;
        border-radius: 50%; background: rgba(255, 255, 255, 0.92);
        border: 2px solid rgba(124, 92, 255, 0.95);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
        pointer-events: none; z-index: 2147483647; opacity: 0;
        transition: left 500ms cubic-bezier(.2,.7,.3,1), top 500ms cubic-bezier(.2,.7,.3,1),
          transform 150ms ease-out, opacity 150ms ease-out;
      }
      #__rec-cursor.visible { opacity: 1; }
      #__rec-cursor.pressed { transform: scale(0.7); }
      #__rec-ripple {
        position: fixed; top: 0; left: 0; width: 46px; height: 46px; margin: -23px 0 0 -23px;
        border-radius: 50%; border: 3px solid rgba(124, 92, 255, 0.9);
        pointer-events: none; z-index: 2147483647; opacity: 0;
      }
      #__rec-ripple.animate { animation: __rec-ripple-anim 550ms ease-out; }
      @keyframes __rec-ripple-anim {
        0% { opacity: 0.9; transform: scale(0.3); }
        100% { opacity: 0; transform: scale(1.9); }
      }
    `,
  });
  await page.evaluate(() => {
    if (document.getElementById('__rec-cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = '__rec-cursor';
    const ripple = document.createElement('div');
    ripple.id = '__rec-ripple';
    document.body.append(cursor, ripple);
  });
}

/** Smoothly moves the fake cursor overlay to viewport coordinates (x, y). */
async function moveCursorTo(page, x, y, duration = 500) {
  await page.evaluate(
    ([x, y, duration]) => {
      const cursor = document.getElementById('__rec-cursor');
      if (!cursor) return;
      cursor.style.transitionDuration = `${duration}ms, ${duration}ms, 150ms, 150ms`;
      cursor.style.left = `${x}px`;
      cursor.style.top = `${y}px`;
      cursor.classList.add('visible');
    },
    [x, y, duration],
  );
  await page.waitForTimeout(duration + 60);
}

/** Flashes a click ripple + brief cursor "press" at viewport coordinates (x, y). */
async function flashClickAt(page, x, y) {
  await page.evaluate(
    ([x, y]) => {
      const cursor = document.getElementById('__rec-cursor');
      const ripple = document.getElementById('__rec-ripple');
      if (cursor) {
        cursor.classList.add('pressed');
        setTimeout(() => cursor.classList.remove('pressed'), 180);
      }
      if (ripple) {
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        ripple.classList.remove('animate');
        void ripple.offsetWidth; // restart the animation if triggered again
        ripple.classList.add('animate');
      }
    },
    [x, y],
  );
  await page.waitForTimeout(220);
}

/** Moves the fake cursor to `locator`, flashes a click ripple, then performs the real click.
 * Use this instead of `locator.click()` for any on-camera button press so a viewer can clearly
 * see what was clicked and when — requires `installCursorOverlay(page)` to have run first. */
export async function clickWithEmphasis(page, locator, { moveDuration = 500, settleMs = 250 } = {}) {
  await smoothScrollTo(page, locator);
  const box = await locator.boundingBox();
  if (!box) throw new Error('clickWithEmphasis: element has no bounding box (not visible?)');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await moveCursorTo(page, x, y, moveDuration);
  await flashClickAt(page, x, y);
  await page.waitForTimeout(settleMs);
  await locator.click();
}

/** Smoothly scrolls `locator` into view instead of Playwright's instant `scrollIntoViewIfNeeded()`,
 * so a recorded viewer can actually follow the scroll rather than seeing a jump-cut. */
export async function smoothScrollTo(page, locator, { block = 'center' } = {}) {
  const needsScroll = await locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top < 0 || rect.bottom > window.innerHeight || rect.left < 0 || rect.right > window.innerWidth;
  });
  if (!needsScroll) return;
  await locator.evaluate((el, block) => el.scrollIntoView({ behavior: 'smooth', block }), block);
  // The browser drives the smooth-scroll animation itself; give it time to finish before any
  // follow-up action (e.g. a click) reads stale coordinates mid-scroll.
  await page.waitForTimeout(700);
}
