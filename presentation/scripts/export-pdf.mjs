// Exports the deck to a PDF using reveal.js's built-in print-pdf mode.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'Lifting-the-Veil-Temporal-Talk.pdf');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:8080/slides/index.html?print-pdf', { waitUntil: 'networkidle' });
// Give reveal.js's print-pdf plugin time to lay out every slide as its own page, and our video
// poster-swap script time to run afterward.
await page.waitForTimeout(2000);
await page.pdf({
  path: outPath,
  width: '1280px',
  height: '720px',
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, bottom: 0, left: 0, right: 0 },
});
console.log(`Saved ${outPath}`);
await browser.close();
