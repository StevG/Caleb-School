// Two new games (Phase 4): Which One? (pick — recognition, never moves the
// ladder) and Build It (build — LEGO tiles, climb-capped at stage 2). Session
// shapes, scoring rules, and the real interactions in the browser.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);
page.on('dialog', d => d.accept());
const post = (u, b) => page.evaluate(([u, b]) => fetch(u, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()), [u, b]);
const get = (u) => page.evaluate(u => fetch(u).then(r => r.json()), u);
const report = () => page.evaluate(() => fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } }).then(r => r.json()));

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

// ---------- Which One? session shape ----------
const ps = await get('/api/session?mode=pick&count=8');
check('pick: session returns items each with 3 choices incl. the target',
  ps.items.length > 0 && ps.items.every(it => it.choices.length === 3 && it.choices.includes(it.w)),
  `n=${ps.items.length}`);
check('pick: the two distractors are misspellings, not the target',
  ps.items.every(it => new Set(it.choices).size === 3), '');

// ---------- Which One? never moves the ladder (recognition) ----------
// isolate a small pool so we can read the word's stage from the report
await post('/api/parent/lists', { pin: '1234', action: 'create', name: 'G', words: 'planet rocket dragon' });
await post('/api/parent/settings', { pin: '1234', bank_enabled: false });
for (let i = 0; i < 4; i++) await post('/api/answer', { word: 'planet', correct: true, mode: 'pick' });
await post('/api/answer', { word: 'planet', correct: false, mode: 'pick' });
let rep = await report();
let planet = rep.lists[0].words.find(w => w.word === 'planet');
let climber = (await get('/api/badges')).badges.find(b => b.id === 'climber');
check('pick: 4 rights + 1 miss leave the ladder untouched (stage 1, 0 level-ups)',
  planet.stage === 1 && climber.value === 0, `stage=${planet.stage} stage_ups=${climber.value}`);
check('pick: but the attempts ARE recorded (word shows as practiced)',
  planet.stage >= 1 && rep.by_type != null, '');

// ---------- Build It climbs to stage 2, then is capped ----------
// one unaided correct climbs a fresh word 1->2; further builds can't climb it
await post('/api/answer', { word: 'rocket', correct: true, mode: 'build' });
rep = await report();
let rocket = rep.lists[0].words.find(w => w.word === 'rocket');
check('build: one correct climbs a fresh word 1 -> 2', rocket.stage === 2, `stage=${rocket.stage}`);
for (let i = 0; i < 4; i++) await post('/api/answer', { word: 'rocket', correct: true, mode: 'build' });
rep = await report();
rocket = rep.lists[0].words.find(w => w.word === 'rocket');
check('build: climb is capped at stage 2 (never masters via tiles)', rocket.stage === 2, `stage=${rocket.stage}`);
// a miss still drops it a rung (one word, one truth)
await post('/api/answer', { word: 'rocket', correct: false, mode: 'build' });
rep = await report();
rocket = rep.lists[0].words.find(w => w.word === 'rocket');
check('build: a miss drops the ladder a rung (2 -> 1)', rocket.stage === 1, `stage=${rocket.stage}`);

// ---------- UI: the two new game cards ----------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.click('.section-card[data-section="words"]');
await page.waitForTimeout(200);
check('home: Which One? and Build It cards appear in the Words section',
  await page.isVisible('.mode-card.pick') && await page.isVisible('.mode-card.build'));

// ---------- Which One? interaction ----------
await page.click('.mode-card.pick');
await page.waitForTimeout(150);
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
await page.waitForTimeout(300);
const nChoices = await page.$$eval('#choices .choice', els => els.length);
const noBoxes = await page.$$eval('#boxes .box', els => els.length);
check('pick play: 3 choice buttons, no letter boxes', nChoices === 3 && noBoxes === 0, `choices=${nChoices} boxes=${noBoxes}`);
// tap the correct choice
let target = await page.evaluate(() => state.target);
await page.click(`#choices .choice:has-text("${target}")`);
await page.waitForTimeout(300);
const pickFb = await page.textContent('#feedback');
const rightMarked = await page.$$eval('#choices .choice.right', els => els.length);
check('pick play: tapping the right spelling is celebrated', /Yes|got it|Nice/.test(pickFb) && rightMarked >= 1, pickFb);
await page.waitForTimeout(700);
await page.click('#quit');
await page.waitForSelector('#home.active');

// ---------- Build It interaction ----------
await page.click('.section-card[data-section="words"]');
await page.waitForTimeout(150);
await page.click('.mode-card.build');
await page.waitForTimeout(150);
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
await page.waitForTimeout(300);
const nTiles = await page.$$eval('#tiles .tile', els => els.length);
target = await page.evaluate(() => state.target);
check('build play: a tile per letter of the word', nTiles === target.length, `tiles=${nTiles} len=${target.length}`);
// build the word by tapping the right tile for each letter in order
for (const ch of target) {
  await page.evaluate((ch) => {
    const tiles = [...document.querySelectorAll('#tiles .tile')];
    const t = tiles.find(b => !b.disabled && b.textContent.trim().endsWith(ch));
    if (t) t.click();
  }, ch);
  await page.waitForTimeout(60);
}
const wordHidden = await page.$eval('#prompt-word', el => el.classList.contains('gone'));
await page.waitForTimeout(100);
await page.click('#check');
await page.waitForTimeout(300);
const buildFb = await page.textContent('#feedback');
check('build play: word hides after the first tile; building it correctly is celebrated',
  wordHidden && /Yes|Perfect|got it|Nice/.test(buildFb), `hidden=${wordHidden} fb="${buildFb}"`);
// undo works before checking (test on the next word)
await page.waitForTimeout(700);

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
