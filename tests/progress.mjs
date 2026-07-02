// Results by list: per-list/per-band mastery, accuracy, daily trend, trouble
// words, "start over" per list, and the settings resets (stars / progress).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);
page.on('dialog', d => d.accept());

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

// seed: a 5-word list; "said" mastered (5 unaided rights climbs the whole
// ladder: 1 + 2 + 2), two other words right twice, "because" missed 4x,
// one aided retype (must NOT count toward accuracy)
await page.evaluate(async () => {
  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  await post('/api/parent/lists', { pin: '1234', action: 'create', name: 'Unit 4 list', words: 'said friend because tomorrow enough' });
  for (let i = 0; i < 5; i++) await post('/api/answer', { word: 'said', correct: true, mode: 'words' });
  for (const w of ['friend', 'tomorrow']) for (let i = 0; i < 2; i++)
    await post('/api/answer', { word: w, correct: true, mode: 'words' });
  for (let i = 0; i < 4; i++) await post('/api/answer', { word: 'because', correct: false, mode: 'words' });
  await post('/api/answer', { word: 'because', correct: true, aided: true, mode: 'words' });
});

// report math: 13 unaided attempts, 9 correct -> 69%; said mastered
const rep = await page.evaluate(async () => {
  const r = await (await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } })).json();
  return r.progress;
});
const L = rep.lists[0];
check('list entry: totals and mastery', L.name === 'Unit 4 list' && L.total === 5 && L.practiced === 4 && L.mastered === 1,
  JSON.stringify({ t: L.total, p: L.practiced, m: L.mastered }));
check('list entry: unaided accuracy (aided retype excluded)', L.accuracy === 69, String(L.accuracy));
check('list entry: daily trend row for today', L.trend.length === 1 && L.trend[0].seen === 13 && L.trend[0].correct === 9,
  JSON.stringify(L.trend));
check('list entry: trouble words ranked', L.trouble[0].word === 'because' && L.trouble[0].missed === 4,
  JSON.stringify(L.trouble));
check('bands: practiced band appears, untouched bands do not',
  rep.bands.length >= 1 && rep.bands.every(b => b.practiced > 0), JSON.stringify(rep.bands.map(b => b.level)));

// dashboard renders it
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForTimeout(700);
const card = await page.evaluate(() => {
  const e = document.querySelector('#progress-lists .prog-entry');
  return { name: e.querySelector('.prog-name').textContent,
           count: e.querySelector('.prog-count').textContent.trim(),
           meta: e.querySelector('.prog-meta').textContent,
           trend: [...e.querySelectorAll('.pt-day')].map(t => t.textContent.trim()),
           trouble: e.querySelector('.prog-trouble')?.textContent || '',
           barPct: e.querySelector('.prog-bar span').style.width };
});
check('card: name + mastered count + bar', card.name === 'Unit 4 list' && card.count.includes('1/5') && card.barPct === '20%',
  JSON.stringify(card));
check('card: accuracy meta line', card.meta.includes('69% right') && card.meta.includes('4 of 5 tried'), card.meta);
check('card: trend chip shows today 9/13', card.trend.length === 1 && card.trend[0].includes('9/13'), JSON.stringify(card.trend));
check('card: trouble line', card.trouble.includes('because') && card.trouble.includes('✗4'), card.trouble);
const bandsFold = await page.evaluate(() => ({
  hidden: document.querySelector('#progress-bands-wrap').classList.contains('hidden'),
  n: document.querySelectorAll('#progress-bands .prog-entry').length }));
check('card: grade-bands fold present with entries', !bandsFold.hidden && bandsFold.n >= 1, JSON.stringify(bandsFold));

// "start over" on the list -> its words' progress is wiped (stars kept)
const starsBefore = await page.evaluate(() =>
  parseInt(document.querySelector('#s-points').textContent, 10));
await page.click('#progress-lists .prog-reset');
await page.waitForTimeout(800);
const afterReset = await page.evaluate(async () => {
  const r = await (await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } })).json();
  return { practiced: r.progress.lists[0].practiced, stars: r.profile.points,
           mostMissed: r.most_missed.length,
           entryText: document.querySelector('#progress-lists .prog-entry').textContent };
});
check('start over: list progress wiped, stars kept',
  afterReset.practiced === 0 && afterReset.stars === starsBefore && afterReset.mostMissed === 0,
  JSON.stringify(afterReset).slice(0, 120));
check('start over: entry shows "Not practiced yet"', afterReset.entryText.includes('Not practiced yet'));

// settings: reset stars -> 0 (progress kept); reset progress -> all zero, list kept
await page.evaluate(async () => {
  await fetch('/api/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word: 'said', correct: true, mode: 'words' }) });
});
await page.click('#reset-stars');
await page.waitForTimeout(700);
const afterStars = await page.evaluate(async () => {
  const r = await (await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } })).json();
  return { stars: r.profile.points, practiced: r.summary.words_practiced };
});
check('reset stars: 0 stars, practice kept', afterStars.stars === 0 && afterStars.practiced === 1,
  JSON.stringify(afterStars));
await page.click('#reset-progress');
await page.waitForTimeout(700);
const afterAll = await page.evaluate(async () => {
  const r = await (await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } })).json();
  return { practiced: r.summary.words_practiced, sessions: r.summary.sessions,
           lists: r.lists.map(l => l.name), name: r.profile.name };
});
check('reset progress: words/sessions cleared, lists + name kept',
  afterAll.practiced === 0 && afterAll.sessions === 0 &&
  JSON.stringify(afterAll.lists) === '["Unit 4 list"]', JSON.stringify(afterAll));

// resets are per child: sibling data survives a reset on child 1
const sibling = await page.evaluate(async () => {
  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  await post('/api/parent/children', { pin: '1234', action: 'add', name: 'Sis' });
  await post('/api/answer', { child: 'c2', word: 'friend', correct: true, mode: 'words' });
  await post('/api/parent/settings', { pin: '1234', child: 'c1', reset_progress: true, reset_points: true });
  const r = await (await fetch('/api/parent/report?child=c2', { headers: { 'X-Parent-Pin': '1234' } })).json();
  return { practiced: r.summary.words_practiced, points: r.profile.points };
});
check('resets are scoped to the selected child', sibling.practiced === 1 && sibling.points === 1,
  JSON.stringify(sibling));

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
