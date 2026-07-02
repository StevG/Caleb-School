import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const OUT = '/tmp/claude-0/-home-user/27945fa0-10eb-51a8-82b0-25f497905001/scratchpad';

const VIEWPORTS = [
  ['iphone-portrait', 390, 780],
  ['iphone-landscape', 844, 390],
  ['ipad-portrait', 810, 1080],
  ['ipad-landscape', 1080, 810],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const results = [];
const check = (name, ok, extra='') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);

for (const [label, w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const inBounds = async (sel) => page.$eval(sel, (el, [vw, vh]) => {
    const r = el.getBoundingClientRect();
    return r.top >= -1 && r.left >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1
      && r.width > 0 && r.height > 0;
  }, [w, h]);

  await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

  // HOME step 1: the two section cards + points in bounds (no scrolling now)
  check(`${label} home: section cards + points visible`,
    await inBounds('.points-big') && await inBounds('#gear') &&
    await inBounds('.sec-words') && await inBounds('.sec-sent'));
  await page.screenshot({ path: `${OUT}/m-${label}-home.png` });
  // step 2: the word games all fit
  await page.click('.sec-words');
  await page.waitForTimeout(300);
  check(`${label} home: word games in bounds`,
    await inBounds('.mode-card.copy') && await inBounds('.mode-card.listen'));

  // PLAY
  await page.click('.mode-card.words');
  await page.click('.chip[data-goal="10"]');
  await page.waitForSelector('#play.active');
  await page.waitForTimeout(250);
  const rows = await page.$$eval('#boxes .box', els => new Set(els.map(e => Math.round(e.getBoundingClientRect().top))).size);
  check(`${label} play: word/boxes/check in bounds, boxes 1 row`,
    await inBounds('#prompt-word') && await inBounds('#boxes') && await inBounds('#check') && rows === 1,
    `box rows: ${rows}`);
  await page.screenshot({ path: `${OUT}/m-${label}-play.png` });

  // play a word to confirm the mechanic works at this size
  const d = (await page.textContent('#prompt-word')).trim();
  await page.focus('#typed');
  await page.fill('#typed', d.replace(/[^a-zA-Z'-]/g, '').toLowerCase());
  await page.dispatchEvent('#typed', 'input');
  await page.click('#check');
  await page.waitForTimeout(300);
  check(`${label} play: correct flow works`, await page.$eval('#boxes', el => el.classList.contains('correct')));

  // DONE (jump straight there — show() is global)
  await page.evaluate(() => { state.earned = 7; window.show('done'); });
  await page.waitForTimeout(100);
  check(`${label} done: emoji + both buttons in bounds`,
    await inBounds('.done-emoji') && await inBounds('#again') && await inBounds('#home-btn'));
  await page.screenshot({ path: `${OUT}/m-${label}-done.png` });

  // GATE
  await page.evaluate(() => window.openGate());
  await page.waitForTimeout(100);
  check(`${label} gate: title + full pinpad in bounds`,
    await inBounds('.gate-title') && await inBounds('.pin-key.del') && await inBounds('.back'));
  await page.screenshot({ path: `${OUT}/m-${label}-gate.png` });

  // PARENT (seed a school list first — the legacy endpoint dedupes, so
  // running once per viewport is harmless)
  await page.evaluate(async () => {
    await fetch('/api/parent/custom_words', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1234', action: 'add',
                             words: 'because friend enough tomorrow' }) });
    state.parentPin = '1234';
    return window.openParent();
  });
  await page.waitForTimeout(400);
  // the child tabs sit above the stats, so on short viewports the grid can
  // start below the fold — the parent body scrolls; bring it into view first
  await page.$eval('.stat-grid', el => el.scrollIntoView({ block: 'nearest' }));
  check(`${label} parent: opens, header + stats in bounds`,
    await page.$eval('#parent', el => el.classList.contains('active'))
    && await inBounds('.parent-title') && await inBounds('.stat-grid'));

  // Word lists card: everything fits horizontally after scrolling into view
  const inX = (sel) => page.$eval(sel, (el, vw) => {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.left >= -1 && r.right <= vw + 1;
  }, w);
  await page.evaluate(() => {
    const d = document.querySelector('#lists-wrap details');
    if (d) d.open = true;
  });
  check(`${label} word lists: bank row, list, chips, buttons all fit`,
    await inX('#bank-wrap summary') && await inX('#lists-wrap details.wlist summary')
    && await inX('#lists-wrap .word-row')
    && await inX('.wlist-actions .danger') && await inX('#custom-add'));
  await page.screenshot({ path: `${OUT}/m-${label}-parent.png` });

  // Update bar: spans the viewport with its button fully visible (its side
  // padding carries env(safe-area-inset-*) for notches)
  await page.evaluate(() => window.showUpdateBar());
  await page.waitForTimeout(120);
  const barOk = await page.$eval('#update-bar', (el, vw) => {
    const r = el.getBoundingClientRect();
    const b = el.querySelector('button').getBoundingClientRect();
    return r.top >= -1 && b.width > 0 && b.left >= -1 && b.right <= vw + 1;
  }, w);
  check(`${label} update bar fits with tappable button`, barOk);

  check(`${label} no JS errors`, errors.length === 0, errors.join('; '));
  await ctx.close();
}

// ROTATION mid-word: portrait -> landscape re-fit
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 780 } });
const p2 = await ctx2.newPage();
const errs2 = [];
p2.on('pageerror', e => errs2.push(e.message));
await p2.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });
await p2.click('.sec-words');
await p2.click('.mode-card.words');
await p2.click('.chip[data-goal="10"]');
await p2.waitForSelector('#play.active');
await p2.waitForTimeout(250);
await p2.focus('#typed');
await p2.type('#typed', 'a'); // mid-word
await p2.setViewportSize({ width: 844, height: 390 });
await p2.waitForTimeout(300);
const rot = await p2.$eval('#boxes', (el) => {
  const r = el.getBoundingClientRect();
  const rows = new Set([...el.children].map(b => Math.round(b.getBoundingClientRect().top))).size;
  return { rows, bottom: r.bottom };
});
const checkBtn = await p2.$eval('#check', el => el.getBoundingClientRect().bottom);
check('rotation mid-word: boxes 1 row, everything above fold', rot.rows === 1 && rot.bottom < 390 && checkBtn <= 391, JSON.stringify({rot, checkBtn}));
check('rotation: typed value preserved', (await p2.inputValue('#typed')) === 'a');
check('rotation: no JS errors', errs2.length === 0, errs2.join('; '));
await p2.screenshot({ path: `${OUT}/m-rotation.png` });
await ctx2.close();

console.log(results.join('\n'));
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
