import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const OUT = '/tmp/claude-0/-home-user/27945fa0-10eb-51a8-82b0-25f497905001/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });
await page.evaluate(() => { window.__spoken = []; window.speechSynthesis.speak = (u) => window.__spoken.push(u.text); });

// ---------- STAGE 1: new word stays visible while typing ----------
await page.click('.mode-card.words');
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
await page.waitForTimeout(300);
const stage1 = await page.evaluate(() => state.itemStage);
const w1 = (await page.textContent('#prompt-word')).trim();
check('stage1: fresh word presented at stage 1 (copy)', stage1 === 1, `stage=${stage1} word="${w1}"`);
const hint1 = (await page.textContent('#prompt-hint')).trim();
check('stage1: hint explains copying', hint1.toLowerCase().includes('copy'), hint1);
await page.focus('#typed');
await page.type('#typed', w1[0]);
await page.waitForTimeout(150);
const stillVisible = await page.$eval('#prompt-word', el => !el.classList.contains('gone'));
check('stage1: word STAYS VISIBLE after first keystroke', stillVisible);
await page.screenshot({ path: `${OUT}/g1-stage1-copy.png` });
// complete it -> level up feedback
await page.fill('#typed', w1.toLowerCase());
await page.dispatchEvent('#typed', 'input');
await page.click('#check');
await page.waitForTimeout(400);
const fb = (await page.textContent('#feedback')).trim();
check('stage1: correct triggers Level up! feedback', fb.includes('Level up'), `"${fb}"`);

// ---------- STAGE 2 presentation: word seeded to memory stage hides on type ----------
// seed 'planet' to stage 2 via API, then hunt for it in sessions
await page.evaluate(async () => {
  await fetch('/api/parent/custom_words', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', action: 'add', words: 'planet rocket' }) });
  await fetch('/api/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word: 'planet', correct: true, mode: 'words' }) }); // 1 -> 2
  // seed 'rocket' all the way to stage 3 (sound)
  for (let i = 0; i < 3; i++) {
    await fetch('/api/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: 'rocket', correct: true, mode: 'words' }) });
  }
});
// custom unmastered words sort first in the review bucket, so a new session should serve them early
await page.click('#quit');
await page.waitForSelector('#home.active');
let sawStage2 = null, sawStage3 = null;
for (let attempt = 0; attempt < 4 && (!sawStage2 || !sawStage3); attempt++) {
  await page.click('.mode-card.words');
  await page.click('.chip[data-goal="20"]');
  await page.waitForSelector('#play.active');
  await page.waitForTimeout(300);
  for (let i = 0; i < 22; i++) {
    if (await page.$eval('#done', el => el.classList.contains('active'))) break;
    const st = await page.evaluate(() => state.itemStage);
    const target = await page.evaluate(() => state.target);
    if (target === 'planet' && !sawStage2) {
      const visible = (await page.textContent('#prompt-word')).trim();
      await page.focus('#typed');
      await page.type('#typed', 'p');
      await page.waitForTimeout(150);
      const gone = await page.$eval('#prompt-word', el => el.classList.contains('gone'));
      sawStage2 = { st, visible, gone };
      await page.fill('#typed', 'planet');
    } else if (target === 'rocket' && !sawStage3) {
      const shown = (await page.textContent('#prompt-word')).trim();
      const spoken = await page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
      sawStage3 = { st, shown, spoken };
      await page.screenshot({ path: `${OUT}/g2-stage3-sound.png` });
      await page.focus('#typed');
      await page.fill('#typed', 'rocket');
    } else {
      const t = await page.evaluate(() => state.target);
      await page.focus('#typed');
      await page.fill('#typed', t);
    }
    await page.dispatchEvent('#typed', 'input');
    await page.click('#check');
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(300);
  const onDone = await page.$eval('#done', el => el.classList.contains('active'));
  if (onDone) { await page.click('#home-btn'); } else { await page.click('#quit'); }
  await page.waitForSelector('#home.active');
}
check('stage2: seeded word presented at stage 2, shown then hides on type',
  !!sawStage2 && sawStage2.st === 2 && sawStage2.visible === 'planet' && sawStage2.gone, JSON.stringify(sawStage2));
check('stage3: seeded word presented at stage 3 — hidden and auto-spoken',
  !!sawStage3 && sawStage3.st === 3 && sawStage3.shown === '' && sawStage3.spoken === 'rocket', JSON.stringify(sawStage3));

// ---------- DASHBOARD: journey + school list statuses ----------
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForTimeout(500);
const jRows = await page.$$eval('#journey-list li', els => els.map(e => e.textContent));
check('dashboard: learning journey renders 4 rungs', jRows.length === 4, JSON.stringify(jRows));
const listRows = await page.$$eval('#lists-wrap details.wlist summary .list-count', els => els.map(e => e.textContent.trim()));
check('dashboard: school list row shows on:total count', listRows.length >= 1 && /^\d+:\d+/.test(listRows[0]), JSON.stringify(listRows));
const chips = await page.$$eval('#lists-wrap .word-row', els => els.map(e => ({ cls: e.className, t: e.textContent })));
check('dashboard: chips carry status classes', chips.some(c => c.cls.includes('st-learning') || c.cls.includes('st-mastered')), JSON.stringify(chips));
const mast = (await page.textContent('#s-mastered')).trim();
check('dashboard: mastered stat tile present', /^\d+$/.test(mast), mast);
await page.screenshot({ path: `${OUT}/g3-parent-journey.png` });

// ---------- LEGACY MIGRATION: old-format word with streak>=2 counts as mastered ----------
const legacy = await page.evaluate(async () => {
  // hit report twice: once now, then after injecting nothing more — the
  // migration test itself is server-side; just verify a fresh legacy-style
  // record classifies correctly by asking the debug path: post 2 corrects
  // to a word then read its most_missed/mastered flags via report.
  const r = await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } });
  return r.json();
});
check('report: journey buckets are consistent (sum = practiced)',
  (legacy.journey.copy + legacy.journey.memory + legacy.journey.sound + legacy.journey.mastered)
    === legacy.summary.words_practiced,
  JSON.stringify(legacy.journey) + ' vs ' + legacy.summary.words_practiced);

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
