// Heart-letter highlighting: irregular graphemes show red in prompt + reveal.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

// API: heart fields ride along on sessions
const api = await page.evaluate(async () => {
  await fetch('/api/parent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', bank_enabled: false }) });
  await fetch('/api/parent/lists', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', action: 'create', name: 'hearts', words: 'said friend people' }) });
  const w = await (await fetch('/api/session?mode=words&count=3')).json();
  const s = await (await fetch('/api/session?mode=sentences&count=6')).json();
  const heartTok = s.items.flatMap(i => i.tokens).find(t => t.heart);
  return { words: w.items, heartTok };
});
const saidItem = api.words.find(i => i.w === 'said');
check('API: word items carry heart mapping', !!saidItem && saidItem.heart === 'ai', JSON.stringify(api.words));
check('API: sentence tokens carry heart mapping', !!api.heartTok, JSON.stringify(api.heartTok));

// UI: fresh heart word at stage 1 -> red letters + heart hint
await page.click('.mode-card.words');
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
await page.waitForTimeout(300);
// find 'said' in the session (3-word pool, so it's 1st-3rd)
let found = false;
for (let i = 0; i < 4; i++) {
  const t = await page.evaluate(() => state.target);
  if (t === 'said') { found = true; break; }
  await page.focus('#typed');
  await page.fill('#typed', t);
  await page.dispatchEvent('#typed', 'input');
  await page.click('#check');
  await page.waitForTimeout(1000);
}
check('reached the heart word "said"', found);
const heartHtml = await page.$eval('#prompt-word', el => el.innerHTML);
const heartText = await page.$$eval('#prompt-word .heart', els => els.map(e => e.textContent).join(''));
check('prompt highlights the tricky part red', heartText === 'ai', `spans="${heartText}" html=${heartHtml}`);
const hint = (await page.textContent('#prompt-hint')).trim();
check('stage-1 hint explains heart words', hint.includes('♥') || hint.toLowerCase().includes('heart'), hint);

// wrong answer -> the reveal also shows the heart letters + heart hint
await page.focus('#typed');
await page.fill('#typed', 'zzzz');
await page.dispatchEvent('#typed', 'input');
await page.click('#check');
await page.waitForTimeout(1100);
const revealHearts = await page.$$eval('#prompt-word .heart', els => els.map(e => e.textContent).join(''));
const revealHint = (await page.textContent('#prompt-hint')).trim();
check('reveal keeps the red heart letters', revealHearts === 'ai', revealHearts);
check('reveal hint teaches the heart part', revealHint.includes('♥'), revealHint);

// non-heart words render plain (no spans)
await page.evaluate(() => {
  // restore bank for other suites
  return fetch('/api/parent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', bank_enabled: true }) });
});
const plain = await page.evaluate(() => heartSpans('cat', null));
const multi = await page.evaluate(() => heartSpans('come', 'o-e'));
const cased = await page.evaluate(() => heartSpans('Said', 'ai'));
check('heartSpans: plain word untouched', plain === 'cat', plain);
check('heartSpans: split grapheme o-e wraps both', multi === 'c<span class="heart">o</span>m<span class="heart">e</span>', multi);
check('heartSpans: matches case-insensitively', cased.includes('<span class="heart">ai</span>'), cased);

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
