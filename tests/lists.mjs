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

// bank row present with an on:total count
const bankCount = (await page.textContent('#bank-count')).trim();
check('bank row shows on:total count', /^\d+:\d+$/.test(bankCount), bankCount);

// open the bank -> one nested, non-deletable band per half grade
await page.evaluate(() => { document.querySelector('#bank-wrap details.wlist').open = true; });
const bandRows = await page.$$eval('#bank-wrap details.band summary', els =>
  els.map(e => ({ label: e.querySelector('.list-name').textContent,
                  count: e.querySelector('.list-count').textContent,
                  on: e.querySelector('input').checked })));
check('bank expands to 17 grade bands with on:total counts',
  bandRows.length === 17 && bandRows.every(b => /^\d+:\d+$/.test(b.count)),
  `${bandRows.length} rows, first: ${JSON.stringify(bandRows[0])}`);
check('default: bands through 3rd grade · early are checked',
  bandRows.filter(b => b.on).length === 5, JSON.stringify(bandRows.map(b => b.on)));
check('grade bands are permanent (no delete button)',
  await page.$$eval('#bank-wrap details.band', els =>
    els.every(e => !e.querySelector('.danger'))));

// uncheck a band -> summary count drops by that band's size and persists
const band1Size = parseInt(bandRows[0].count, 10); // its enabled count
const before = parseInt(bankCount, 10);
await page.click('#bank-wrap details.band summary input');
await page.waitForTimeout(400);
const after = parseInt((await page.textContent('#bank-count')).trim(), 10);
const savedBands = await page.evaluate(async () => {
  const r = await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } });
  return (await r.json()).bank.bands.filter(b => b.enabled).map(b => b.level);
});
check('band toggle: count drops by the band size and persists',
  after === before - band1Size && !savedBands.includes(1) && savedBands.includes(3),
  `${before} -> ${after} (band=${band1Size}), saved: ${JSON.stringify(savedBands)}`);
await page.click('#bank-wrap details.band summary input'); // restore
await page.waitForTimeout(300);

// per-word toggle inside a band: uncheck one word -> band shows 49:50
await page.evaluate(() => {
  document.querySelector('#bank-wrap details.wlist').open = true;
  document.querySelector('#bank-wrap details.band').open = true;
});
const bankWord = (await page.textContent('#bank-wrap details.band .word-row .wr-word')).trim();
await page.click('#bank-wrap details.band .word-row input');
await page.waitForTimeout(400);
const bandCount = (await page.$$eval('#bank-wrap details.band summary .list-count',
  els => els[0].textContent)).trim();
const offOnServer = await page.evaluate(async (w) => {
  const r = await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } });
  const b = (await r.json()).bank.bands[0];
  return { count: b.enabled_count, total: b.total,
           off: b.words.find(x => x.word === w)?.on === false };
}, bankWord);
check('bank word toggle: band count drops by one and persists',
  bandCount.startsWith(`${band1Size - 1}:${band1Size}`) &&
  offOnServer.count === band1Size - 1 && offOnServer.off,
  `${bandCount} word="${bankWord}"`);
await page.evaluate(() => {
  document.querySelector('#bank-wrap details.wlist').open = true;
  document.querySelector('#bank-wrap details.band').open = true;
});
await page.click('#bank-wrap details.band .word-row input'); // restore
await page.waitForTimeout(300);

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
const chipWord = await page.textContent('#lists-wrap .word-row .wr-word');
await page.click('#lists-wrap .word-row input[type=checkbox]'); // uncheck the word
await page.waitForTimeout(400);
rows = await page.$$eval('#lists-wrap details.wlist summary .list-count', els => els.map(e => e.textContent.trim()));
const dimmed = await page.$eval('#lists-wrap .word-row', el => el.classList.contains('off'));
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

// copy a grade band into a new custom list — no typing
await page.evaluate(() => {
  document.querySelector('#bank-wrap details.wlist').open = true;
  document.querySelector('#bank-wrap details.band').open = true;
});
await page.click('#bank-wrap details.band .wlist-actions button');
await page.waitForTimeout(500);
const copied = await page.$$eval('#lists-wrap details.wlist summary', els =>
  els.map(e => ({ name: e.querySelector('.list-name').textContent,
                  count: e.querySelector('.list-count').textContent.trim() })));
check('copy band -> new list with all its words',
  copied.length === 1 && copied[0].name.includes('1st grade') &&
  copied[0].count.startsWith(`${band1Size}:${band1Size}`), JSON.stringify(copied));

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
