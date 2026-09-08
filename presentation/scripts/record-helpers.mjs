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
