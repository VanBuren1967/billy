import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const htmlPath = path.join(repoRoot, 'docs', 'billy-launch-checklist.html');
const pdfPath = path.join(repoRoot, 'docs', 'billy-launch-checklist.pdf');

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`file://${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });

await page.pdf({
  path: pdfPath,
  format: 'Letter',
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `
    <div style="font-size: 8pt; color: #888; width: 100%; padding: 0 0.75in; display: flex; justify-content: space-between; font-family: Helvetica, sans-serif;">
      <span>Steele &amp; Co. — Launch Checklist</span>
      <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>
  `,
  margin: { top: '0.75in', bottom: '0.85in', left: '0.75in', right: '0.75in' },
});

await browser.close();
console.log(`Rendered: ${pdfPath}`);
