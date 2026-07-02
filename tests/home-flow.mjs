// Home drill-down: pick a SECTION (Words / Sentences) -> pick a GAME ->
// (word games) pick how many. Only a few big targets show per step, so the
// home never needs scrolling. Back steps up one level.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);

const panel = () => page.evaluate(() =>
  [...document.querySelectorAll('.home-panel')].filter(p => !p.classList.contains('hidden')).map(p => p.dataset.panel));
const fits = () => page.evaluate(() => {
  const h = document.querySelector('.home-inner');
  return h.scrollHeight <= h.clientHeight + 1;
});

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

// STEP 1: only the two section cards, and everything fits without scrolling
const start = await page.evaluate(() => ({
  sections: [...document.querySelectorAll('.section-card')].filter(c => c.offsetParent).map(c => c.dataset.section),
  games: [...document.querySelectorAll('.mode-card')].filter(c => c.offsetParent).length }));
check('start: two section cards, no games yet', JSON.stringify(start.sections) === '["words","sentences"]' && start.games === 0, JSON.stringify(start));
check('start: home fits without scrolling', await fits());
check('start: on the sections panel', JSON.stringify(await panel()) === '["sections"]');

// STEP 2: Words -> only the three word games (no sentence games), still fits
await page.click('.section-card.sec-words');
await page.waitForTimeout(300);
const wordGames = await page.evaluate(() => ({
  panel: document.querySelector('.home-panel:not(.hidden)').dataset.panel,
  games: [...document.querySelectorAll('.mode-card')].filter(c => c.offsetParent).map(c => c.dataset.mode),
  back: !!document.querySelector('.home-panel:not(.hidden) .back-link') }));
check('Words -> the three word games only', JSON.stringify(wordGames.games) === '["copy","words","listen"]', JSON.stringify(wordGames.games));
check('Words -> games panel with a Back button', wordGames.panel === 'games' && wordGames.back);
check('Words -> fits without scrolling', await fits());

// STEP 3: a word game -> the count chips
await page.click('.mode-card.copy');
await page.waitForTimeout(300);
const goal = await page.evaluate(() => ({
  panel: document.querySelector('.home-panel:not(.hidden)').dataset.panel,
  chips: [...document.querySelectorAll('.chip')].filter(c => c.offsetParent).length,
  started: document.getElementById('play').classList.contains('active') }));
check('word game -> the 3 count chips, not started yet', goal.panel === 'goal' && goal.chips === 3 && !goal.started, JSON.stringify(goal));

// Back steps up one level at a time
await page.click('.back-link[data-back="games"]');
await page.waitForTimeout(200);
check('Back from count -> games panel', JSON.stringify(await panel()) === '["games"]');
await page.click('.back-link[data-back="sections"]');
await page.waitForTimeout(200);
check('Back from games -> sections panel', JSON.stringify(await panel()) === '["sections"]');

// Sentences -> only the two sentence games; a sentence game starts straight away
await page.click('.section-card.sec-sent');
await page.waitForTimeout(300);
const sentGames = await page.$$eval('.mode-card', els => els.filter(c => c.offsetParent).map(c => c.dataset.mode));
check('Sentences -> the two sentence games only', JSON.stringify(sentGames) === '["sentences","memory"]', JSON.stringify(sentGames));
check('Sentences -> fits without scrolling', await fits());
await page.click('.mode-card.sentences');
await page.waitForSelector('#play.active');
check('sentence game starts on one tap (no count step)', true);

// quitting returns to step 1
await page.click('#quit');
await page.waitForSelector('#home.active');
await page.waitForTimeout(300);
check('quitting returns to the sections panel', JSON.stringify(await panel()) === '["sections"]');

// picking a count actually starts a word game
await page.click('.section-card.sec-words');
await page.click('.mode-card.words');
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
check('word game: picking a count starts it', true);
await page.click('#quit');
await page.waitForSelector('#home.active');

// the ⚙️ gear is on top and opens the grown-ups gate (regression: it once got
// swallowed by the scroll layer under it on iOS)
const gearOK = await page.evaluate(() => {
  const g = document.getElementById('gear');
  const r = g.getBoundingClientRect();
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { onTop: top === g, tapH: Math.round(r.height) };
});
check('gear: on top and >=44px tall', gearOK.onTop && gearOK.tapH >= 44, JSON.stringify(gearOK));
await page.click('#gear');
await page.waitForTimeout(200);
check('gear opens the grown-ups gate', await page.$eval('#gate', el => el.classList.contains('active')));

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
