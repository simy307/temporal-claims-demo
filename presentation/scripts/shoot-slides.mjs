// Screenshots every reveal.js slide at the deck's native 1280x720 resolution (no letterboxing)
// for design QA. Usage: node scripts/shoot-slides.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'qa-screenshots');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8080/slides/index.html', { waitUntil: 'networkidle' });
await page.evaluate(() => Reveal.configure({ transition: 'none' }));

// Ask reveal.js how many slides exist (horizontal only, we don't use vertical stacks).
const total = await page.evaluate(() => Reveal.getTotalSlides());
console.log(`Found ${total} slides`);

for (let i = 0; i < total; i += 1) {
  await page.evaluate((idx) => Reveal.slide(idx), i);
  await page.waitForTimeout(400);
  const path = join(outDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
  await page.screenshot({ path });
  console.log(`  saved ${path}`);
}

await browser.close();
