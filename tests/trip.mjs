// Dino Space Trip (Phase 3): planets fueled by lifetime level-ups. Threshold
// crossings award +10 stars and a themed bonus fact, once each; the home chip,
// journey screen, and done-screen landing celebration; stickiness through a
// reset; the in-session rocket.
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

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

// ---------- fresh trip ----------
let tv = await get('/api/trip');
check('trip: 12 planets, none visited on a fresh child',
  tv.total === 12 && tv.reached === 0 && tv.planets.length === 12 && tv.planets.every(p => !p.visited),
  `total=${tv.total} reached=${tv.reached}`);
check('trip: planets have names, emoji, fuel thresholds, decks',
  tv.planets.every(p => p.name && p.emoji && p.fuel > 0 && p.cat), '');

// ---------- reaching the first planet ----------
// climb the ladder to 5 level-ups: Copy It advances a fresh word 1->2 (one
// level-up) per word, uncapped enough for the first rung. Use 5 fresh words.
const words = ['aaa','bbb','ccc','ddd','eee'];
for (const w of words) await post('/api/answer', { word: w, correct: true, mode: 'copy' });
let st = await get('/api/state');
check('setup: 5 level-ups banked (fuel)', st.trip.fuel === 5, `fuel=${st.trip.fuel}`);
const pointsBefore = st.points;
const land = await post('/api/session_end', { mode: 'copy', count: 5, correct: 5, points: 5 });
check('land: reaching planet 1 returns new_planet with +10 stars',
  land.new_planet && land.new_planet.idx === 0 && land.new_planet.stars === 10,
  JSON.stringify(land.new_planet && { idx: land.new_planet.idx, stars: land.new_planet.stars, name: land.new_planet.name }));
check('land: the landing came with a themed bonus fact card',
  land.new_planet && land.new_planet.fact && land.new_planet.fact.text, '');
check('land: +10 landing stars are in the point total',
  land.points >= pointsBefore + 10, `${pointsBefore} -> ${land.points}`);

// ---------- no double-award ----------
const again = await post('/api/session_end', { mode: 'copy', count: 5, correct: 0, points: 0 });
check('no double-land: a session with no new fuel does not re-award planet 1',
  again.new_planet == null, JSON.stringify(again.new_planet));

// ---------- multi-crossing in one session (jump past two planets) ----------
// get to fuel 21 (planet 3): need 16 more level-ups. Master fresh words:
// each fresh word in copy gives 1 level-up (1->2). Use 16 more words.
for (let i = 0; i < 16; i++) await post('/api/answer', { word: 'w' + i + 'x', correct: true, mode: 'copy' });
st = await get('/api/state');
const multi = await post('/api/session_end', { mode: 'copy', count: 10, correct: 10, points: 10 });
check('multi-land: crossing planets 2 AND 3 in one session celebrates the TOP one',
  multi.new_planet && multi.new_planet.idx === 2, JSON.stringify(multi.new_planet && multi.new_planet.idx));
check('multi-land: stars cover BOTH new planets (2 x 10 = 20)',
  multi.new_planet && multi.new_planet.stars === 20, JSON.stringify(multi.new_planet && multi.new_planet.stars));
tv = await get('/api/trip');
check('trip: 3 planets now visited', tv.reached === 3, `reached=${tv.reached}`);

// ---------- stickiness through a full reset ----------
await post('/api/parent/settings', { pin: '1234', reset_progress: true, reset_points: true });
tv = await get('/api/trip');
check('sticky: visited planets survive a progress + stars reset', tv.reached === 3, `reached=${tv.reached}`);

// ---------- UI: home chip + journey screen ----------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
check('home: Space Trip chip is visible', await page.isVisible('#trip-btn'));
await page.click('#trip-btn');
await page.waitForSelector('#trip-screen.active');
await page.waitForTimeout(300);
const planetRows = await page.$$eval('#trip-map .trip-planet', els => els.length);
const visitedRows = await page.$$eval('#trip-map .trip-planet.visited', els => els.length);
const svgs = await page.$$eval('#trip-map .planet-svg', els => els.length);
check('journey: 12 planet rows, 3 visited, all drawn', planetRows === 12 && visitedRows === 3 && svgs === 12,
  `rows=${planetRows} visited=${visitedRows} svgs=${svgs}`);
const nextName = await page.$eval('#trip-map .trip-planet.next .tp-info b', el => el.textContent).catch(() => '');
check('journey: the next (unvisited) planet shows its name + a rocket', nextName.length > 0 && nextName !== '???', nextName);
const unnamed = await page.$$eval('#trip-map .trip-planet:not(.visited):not(.next) .tp-info b',
  els => els.map(e => e.textContent));
check('journey: far-off planets stay hidden as ???', unnamed.length > 0 && unnamed.every(t => t === '???'), JSON.stringify(unnamed.slice(0,2)));
await page.click('#trip-back');
await page.waitForSelector('#home.active');

// ---------- done-screen planet celebration render ----------
const shown = await page.evaluate(() => {
  celebratePlanet({ idx: 4, name: 'Comet Chomp', emoji: '☄️', stars: 10,
    fact: { emoji: '🚀', text: 'A space fact.' } });
  const el = document.getElementById('planet-reveal');
  return { visible: !el.classList.contains('hidden'),
           hasName: el.textContent.includes('Comet Chomp'),
           hasStars: el.textContent.includes('+10'),
           hasSvg: !!el.querySelector('.planet-svg') };
});
check('done: planet landing renders banner + planet + stars', shown.visible && shown.hasName && shown.hasStars && shown.hasSvg,
  JSON.stringify(shown));

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
