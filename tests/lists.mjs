// Word-lists manager: toggleable sources, per-word switches, on:total counts.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);
page.on('dialog', d => d.accept()); // auto-accept the delete confirm

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

// open the parent dashboard
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForTimeout(500);

// bank row present with a count
const bankCount = (await page.textContent('#bank-count')).trim();
check('bank row shows word count', /\d+ words/.test(bankCount), bankCount);

// create a list through the UI
await page.fill('#list-name', 'Week of Jul 7');
await page.fill('#custom-input', 'because\nfriend enough, tomorrow');
await page.click('#custom-add');
await page.waitForTimeout(400);
let rows = await page.$$eval('#lists-wrap details.wlist summary .list-count', els => els.map(e => e.textContent.trim()));
check('created list shows 4:4', rows.length === 1 && rows[0].startsWith('4:4'), JSON.stringify(rows));
const name = await page.textContent('#lists-wrap .list-name');
check('list keeps its name', name.trim() === 'Week of Jul 7', name.trim());

// open the list, toggle one word off -> count drops to 3:4, chip dims
await page.click('#lists-wrap details.wlist summary .list-name');
await page.waitForTimeout(200);
const chipWord = await page.textContent('#lists-wrap .word-chip .chip-word');
await page.click('#lists-wrap .word-chip'); // tap toggles
await page.waitForTimeout(400);
rows = await page.$$eval('#lists-wrap details.wlist summary .list-count', els => els.map(e => e.textContent.trim()));
const dimmed = await page.$eval('#lists-wrap .word-chip', el => el.classList.contains('off'));
check('word toggle: count drops to 3:4 and chip dims', rows[0].startsWith('3:4') && dimmed, `${rows[0]} word="${chipWord}"`);

// list stays open after the re-render
const stillOpen = await page.$eval('#lists-wrap details.wlist', el => el.open);
check('list stays open across re-render', stillOpen);

// toggled-off word is excluded from the pool when the bank is off
const pool = await page.evaluate(async (offWord) => {
  await fetch('/api/parent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', bank_enabled: false }) });
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    const r = await fetch('/api/session?mode=words&count=20');
    (await r.json()).items.forEach(it => seen.add(it.w));
  }
  return { words: [...seen], hasOff: seen.has(offWord) };
}, chipWord.trim());
check('pool: bank off -> only the 3 enabled list words', pool.words.length === 3 && !pool.hasOff, JSON.stringify(pool.words));

// toggle the whole list off via its checkbox -> fallback pool (bank) kicks in
await page.click('#lists-wrap details.wlist summary input[type=checkbox]');
await page.waitForTimeout(400);
const fallback = await page.evaluate(async () => {
  const r = await fetch('/api/session?mode=words&count=8');
  return (await r.json()).items.length;
});
check('all sources off -> kid still gets a session (bank fallback)', fallback === 8, String(fallback));

// re-render the dashboard: the bank checkbox must reflect the server (off)
await page.evaluate(() => window.openParent());
await page.waitForTimeout(400);
const cbOff = await page.$eval('#bank-enabled', el => !el.checked);
check('bank checkbox reflects server state after re-render', cbOff);
// now click it back on -> persists via settings
await page.click('#bank-enabled');
await page.waitForTimeout(400);
const bankOn = await page.evaluate(async () => {
  const r = await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } });
  return (await r.json()).profile.bank_enabled;
});
check('bank checkbox persists to the server', bankOn === true);

// per-list add + delete list
await page.fill('#lists-wrap .wlist-actions input', 'holiday');
await page.click('#lists-wrap .wlist-actions button');
await page.waitForTimeout(400);
rows = await page.$$eval('#lists-wrap details.wlist summary .list-count', els => els.map(e => e.textContent.trim()));
check('add-to-list: count grows to 4:5', rows[0].startsWith('4:5'), rows[0]);
await page.click('#lists-wrap .wlist-actions .danger');
await page.waitForTimeout(400);
const listsLeft = await page.$$eval('#lists-wrap details.wlist', els => els.length);
check('delete list removes it', listsLeft === 0);

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
