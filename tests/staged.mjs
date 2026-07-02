// The learning ladder under the three word games: Copy It presents visible
// and climbs only copy->memory; Hide & Spell presents hidden-on-type and
// climbs up to sound; only Listen & Spell (true from-sound recall) can push
// a word to mastered. Plus the dashboard views built on the ladder.
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

// ---------- Copy It: always visible, climbs 1 -> 2 only ----------
await page.click('.mode-card.copy');
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
await page.waitForTimeout(300);
const stage1 = await page.evaluate(() => state.itemStage);
const w1 = (await page.textContent('#prompt-word')).trim();
check('Copy It: word presented at stage 1', stage1 === 1, `stage=${stage1} word="${w1}"`);
const hint1 = (await page.textContent('#prompt-hint')).trim();
check('Copy It: hint explains copying', hint1.toLowerCase().includes('copy') || hint1.includes('♥'), hint1);
await page.focus('#typed');
await page.type('#typed', w1[0].toLowerCase());
await page.waitForTimeout(150);
check('Copy It: word STAYS VISIBLE after first keystroke',
  await page.$eval('#prompt-word', el => !el.classList.contains('gone')));
await page.fill('#typed', w1.toLowerCase());
await page.dispatchEvent('#typed', 'input');
await page.click('#check');
await page.waitForTimeout(400);
const fb = (await page.textContent('#feedback')).trim();
check('Copy It: fresh word correct -> Level up! (1 -> 2)', fb.includes('Level up'), `"${fb}"`);
await page.screenshot({ path: `${OUT}/g1-copy-mode.png` });
await page.click('#quit');
await page.waitForSelector('#home.active');

// ---------- Hide & Spell: always hides on type ----------
await page.evaluate(async () => {
  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  await post('/api/parent/custom_words', { pin: '1234', action: 'add', words: 'planet rocket' });
});
await page.click('.mode-card.words');
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
await page.waitForTimeout(300);
const hs = await page.evaluate(() => ({ stage: state.itemStage,
  visible: document.getElementById('prompt-word').textContent.trim() }));
check('Hide & Spell: word presented at stage 2 (visible first)',
  hs.stage === 2 && hs.visible.length > 0, JSON.stringify(hs));
await page.focus('#typed');
await page.type('#typed', hs.visible[0].toLowerCase());
await page.waitForTimeout(150);
check('Hide & Spell: word GONE after first keystroke',
  await page.$eval('#prompt-word', el => el.classList.contains('gone')));
await page.click('#quit');
await page.waitForSelector('#home.active');

// ---------- climb caps (API-level, exact) ----------
const caps = await page.evaluate(async () => {
  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const stageOf = async (w) => {
    const rep = await (await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } })).json();
    return rep.lists[0].words.find(x => x.word === w)?.stage;
  };
  await post('/api/answer', { word: 'rocket', correct: true, mode: 'words' }); // 1 -> 2
  const s2 = await stageOf('rocket');
  for (let i = 0; i < 5; i++) await post('/api/answer', { word: 'rocket', correct: true, mode: 'copy' });
  const afterCopy = await stageOf('rocket'); // copy can't climb a stage-2 word
  await post('/api/answer', { word: 'rocket', correct: true, mode: 'words' });
  await post('/api/answer', { word: 'rocket', correct: true, mode: 'words' }); // 2 -> 3
  const s3 = await stageOf('rocket');
  for (let i = 0; i < 4; i++) await post('/api/answer', { word: 'rocket', correct: true, mode: 'words' });
  const afterWords = await stageOf('rocket'); // words can't master a stage-3 word
  await post('/api/answer', { word: 'rocket', correct: true, mode: 'listen' });
  await post('/api/answer', { word: 'rocket', correct: true, mode: 'listen' }); // 3 -> 4
  const s4 = await stageOf('rocket');
  return { s2, afterCopy, s3, afterWords, s4 };
});
check('ladder: Hide & Spell correct climbs 1 -> 2', caps.s2 === 2, JSON.stringify(caps));
check('cap: Copy It can NOT climb a from-memory word', caps.afterCopy === 2, String(caps.afterCopy));
check('ladder: Hide & Spell climbs 2 -> 3', caps.s3 === 3, String(caps.s3));
check('cap: Hide & Spell can NOT master a from-sound word', caps.afterWords === 3, String(caps.afterWords));
check('Listen & Spell masters it (3 -> 4)', caps.s4 === 4, String(caps.s4));

// ---------- DASHBOARD: journey + school list statuses ----------
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForTimeout(500);
const jRows = await page.$$eval('#journey-list li', els => els.map(e => e.textContent));
check('dashboard: learning journey renders 4 rungs', jRows.length === 4, JSON.stringify(jRows));
const listRows = await page.$$eval('#lists-wrap details.wlist summary .list-count', els => els.map(e => e.textContent.trim()));
check('dashboard: school list row shows on:total count', listRows.length >= 1 && /^\d+:\d+/.test(listRows[0]), JSON.stringify(listRows));
const chips = await page.$$eval('#lists-wrap .word-row', els => els.map(e => ({ cls: e.className, t: e.textContent })));
check('dashboard: chips carry status classes', chips.some(c => c.cls.includes('st-mastered')), JSON.stringify(chips));
const mast = (await page.textContent('#s-mastered')).trim();
check('dashboard: mastered stat tile counts rocket', mast === '1', mast);
await page.screenshot({ path: `${OUT}/g3-parent-journey.png` });

const legacy = await page.evaluate(async () => {
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
