import { chromium } from '@playwright/test';

const TOKEN = '9cc05e69-605d-4249-9db7-34c757c04c33';
const CAPTURE_ID = 'ba0cfcf9-c319-4b62-9afc-ae6a43cb5c8b';
const ENDPOINT = `https://mcp.figma.com/mcp/capture/${CAPTURE_ID}/submit`;

const browser = await chromium.launch();
// 1150px breakpoint, as requested.
const ctx = await browser.newContext({ viewport: { width: 1150, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// Do NOT consume Priya's notification again — swallow the mark-seen write.
await page.route('**/api/portal/activity/seen', (r) => r.abort());

// Magic-link auth → sets portal_token cookie → redirects to /portal/63
await page.goto(`http://localhost:3001/api/portal/auth?token=${TOKEN}`, { waitUntil: 'networkidle' });
console.log('landed on:', page.url());

// Let the AI insight finish streaming so the card captures with real content.
await page.waitForTimeout(9000);

// Strip dev-only chrome + freeze animations so the capture is clean.
await page.addStyleTag({ content: `
  nextjs-portal { display: none !important; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
` });

const summary = await page.textContent('p');
console.log('insight rendered:', summary?.slice(0, 60));

// Inject Figma's capture script and submit.
const res = await page.context().request.get('https://mcp.figma.com/mcp/html-to-design/capture.js');
await page.evaluate((s) => {
  const el = document.createElement('script');
  el.textContent = s;
  document.head.appendChild(el);
}, await res.text());
await page.waitForTimeout(1000);

const result = await page.evaluate(({ captureId, endpoint }) =>
  window.figma.captureForDesign({ captureId, endpoint, selector: 'body' }),
  { captureId: CAPTURE_ID, endpoint: ENDPOINT }
);
console.log('capture submitted:', JSON.stringify(result));

await ctx.close();
await browser.close();
