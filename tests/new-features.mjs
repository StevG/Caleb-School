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

// ---------- 1. ACTIVE BOX CURSOR ----------
await page.click('.section-card.sec-words'); await page.click('.mode-card.words');
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
await page.waitForTimeout(250);
let activeIdx = await page.$$eval('#boxes .box', els => els.findIndex(e => e.classList.contains('active')));
check('active box: first box pulses before typing', activeIdx === 0, `idx=${activeIdx}`);
const t1 = (await page.textContent('#prompt-word')).trim();
await page.focus('#typed');
await page.type('#typed', t1.slice(0, 2).toLowerCase());
activeIdx = await page.$$eval('#boxes .box', els => els.findIndex(e => e.classList.contains('active')));
const expectIdx = t1.length > 2 ? 2 : -1; // 2-letter word: no next box
check('active box: advances with typing', activeIdx === expectIdx, `idx=${activeIdx} word="${t1}"`);
await page.screenshot({ path: `${OUT}/f1-activebox.png` });
// finish this word correctly (words mode: lowercase ok)
await page.focus('#typed');
await page.fill('#typed', t1.toLowerCase());
await page.dispatchEvent('#typed', 'input');
await page.click('#check');
await page.waitForTimeout(300);
check('words mode: still case-insensitive', await page.$eval('#boxes', el => el.classList.contains('correct')));
// the text input must KEEP focus across Check + the next word, so the iOS
// keyboard never closes/reopens (no bounce). Tapping Check must not blur it.
check('keyboard: input stays focused right after Check',
  await page.evaluate(() => document.activeElement.id) === 'typed');
await page.waitForTimeout(1000); // auto-advance to the next word
check('keyboard: input still focused on the next word',
  await page.evaluate(() => document.activeElement.id) === 'typed');
await page.click('#quit');

// ---------- 2. CAPITALS IN SENTENCES ----------
await page.waitForSelector('#home.active');
await page.click('.section-card.sec-sent'); await page.click('.mode-card.sentences');
await page.waitForSelector('#play.active');
await page.waitForTimeout(300);
const disp = (await page.textContent('#prompt-word')).trim();
const cased = disp.replace(/[^a-zA-Z'-]/g, '');
const hasCap = /[A-Z]/.test(cased);
// type it all-lowercase -> must be WRONG (capital missing), with capital hint
await page.focus('#typed');
await page.fill('#typed', cased.toLowerCase());
await page.dispatchEvent('#typed', 'input');
const inputKeptCase = await page.inputValue('#typed');
await page.click('#check');
await page.waitForTimeout(300);
if (hasCap) {
  const fb = (await page.textContent('#feedback')).trim();
  const wrong = await page.$eval('#boxes', el => el.classList.contains('wrong'));
  check('capitals: lowercase attempt on capitalized word is WRONG', wrong, `word="${disp}"`);
  check('capitals: feedback mentions the capital', fb.includes('capital'), `fb="${fb}"`);
  // wait for reveal, then retype WITH the capital
  await page.waitForTimeout(900);
  const revealed = (await page.textContent('#prompt-word')).trim();
  check('capitals: reveal shows the cased word', revealed === cased, `revealed="${revealed}"`);
  await page.click('#next'); // Try again
  await page.waitForTimeout(200);
  await page.focus('#typed');
  await page.fill('#typed', cased);
  await page.dispatchEvent('#typed', 'input');
  await page.click('#check');
  await page.waitForTimeout(300);
  check('capitals: correctly-cased retype accepted', await page.$eval('#boxes', el => el.classList.contains('correct')));
} else {
  check('capitals: first word had no capital (rare) — skipped', true, `word="${disp}"`);
}
await page.waitForTimeout(900);
await page.click('#quit');

// ---------- 3. LISTEN & SPELL ----------
await page.waitForSelector('#home.active');
// capture what gets spoken
await page.evaluate(() => {
  window.__spoken = [];
  window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); };
});
const listenCard = await page.$('.mode-card.listen');
check('listen: mode card exists on home', !!listenCard);
await page.click('.section-card.sec-words'); await page.click('.mode-card.listen');
// the picker glides in under the tapped card (~300ms animation)
await page.waitForSelector('#goal-row:not(.hidden)', { timeout: 3000 });
const goalVisible = await page.$eval('#goal-row', el => !el.classList.contains('hidden'));
check('listen: goal picker shows (10/15/20)', goalVisible);
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
await page.waitForTimeout(300);
const promptEmpty = (await page.textContent('#prompt-word')).trim() === '';
const spoken1 = await page.evaluate(() => window.__spoken);
const speakerShown = await page.$eval('#speaker', el => !el.classList.contains('hidden'));
const boxCount = await page.$$eval('#boxes .box', els => els.length);
check('listen: word NOT shown, auto-spoken, speaker + boxes present',
  promptEmpty && spoken1.length >= 1 && speakerShown && boxCount > 0, `spoken="${spoken1}"`);
await page.screenshot({ path: `${OUT}/f2-listen.png` });
// answer it using the (hidden) target
const target = await page.evaluate(() => state.target);
check('listen: spoken word matches the target', spoken1[spoken1.length-1] === target, `${spoken1[spoken1.length-1]} vs ${target}`);
await page.focus('#typed');
await page.fill('#typed', target);
await page.dispatchEvent('#typed', 'input');
await page.click('#check');
await page.waitForTimeout(300);
check('listen: correct answer accepted', await page.$eval('#boxes', el => el.classList.contains('correct')));
// get the NEXT one wrong -> reveal should show the word
await page.waitForTimeout(1000);
const t2 = await page.evaluate(() => state.target);
await page.focus('#typed');
await page.fill('#typed', 'z'.repeat(t2.length));
await page.dispatchEvent('#typed', 'input');
await page.click('#check');
await page.waitForTimeout(1100);
const shown = (await page.textContent('#prompt-word')).trim();
check('listen: wrong answer reveals the word for study', shown === t2, `shown="${shown}"`);
await page.click('#quit');

// ---------- 4. PER-MODE STATISTICS ----------
await page.waitForSelector('#home.active');
const rep = await page.evaluate(async () => {
  const r = await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } });
  return r.json();
});
const bm = rep.by_mode || {};
check('stats: by_mode has words entry', !!bm.words && bm.words.seen >= 1, JSON.stringify(bm.words));
check('stats: by_mode has sentences entry', !!bm.sentences && bm.sentences.seen >= 1, JSON.stringify(bm.sentences));
check('stats: by_mode has listen entry', !!bm.listen && bm.listen.seen >= 2, JSON.stringify(bm.listen));
// ---------- 5. DAILY STATS + LAST PRACTICED ----------
const today = new Date().toISOString().slice(0, 10);
check('stats: daily history has today as its own row',
  Array.isArray(rep.daily) && rep.daily.length >= 1 && rep.daily[0].date === today
  && rep.daily[0].seen >= 3, JSON.stringify(rep.daily[0]));
check('stats: last_practice_ts is recent',
  rep.last_practice_ts > 0 && (Date.now() / 1000 - rep.last_practice_ts) < 300,
  String(rep.last_practice_ts));

// dashboard renders the card
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForTimeout(500);
const modeRows = await page.$$eval('#modes-list li', els => els.map(e => e.textContent));
check('stats: dashboard shows per-mode rows', modeRows.length >= 3 && !modeRows[0].includes('Nothing'), JSON.stringify(modeRows));
const dailyRows = await page.$$eval('#daily-list li', els => els.map(e => e.textContent));
check('stats: dashboard shows day-by-day rows', dailyRows.length >= 1 && !dailyRows[0].includes('No practice'), JSON.stringify(dailyRows));
const lastTxt = (await page.textContent('#s-last')).trim();
check('stats: dashboard shows last-practiced', lastTxt !== 'never', `"${lastTxt}"`);
await page.screenshot({ path: `${OUT}/f3-parent-modes.png` });

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
