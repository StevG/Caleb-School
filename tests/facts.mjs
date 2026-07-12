// Fact cards (Phase 2): the dino/space/LEGO collectible reward + badge nudges.
// Earning one card per real session, the daily cap, no repeats, stickiness
// through a reset, the collection screen, and the done-screen reveal + nudge.
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

// ---------- catalog ----------
let fc = await get('/api/facts');
check('catalog: 90 facts across 3 decks, none owned on a fresh child',
  fc.total === 90 && fc.earned === 0 && fc.decks.length === 3,
  `total=${fc.total} earned=${fc.earned} decks=${fc.decks.length}`);
check('catalog: each deck has 30 cards, all face-down',
  fc.decks.every(d => d.total === 30 && d.owned === 0 && d.cards.every(c => !c.owned && c.text === '')),
  JSON.stringify(fc.decks.map(d => [d.cat, d.total])));

// ---------- earning: one per session of 5+ ----------
const e1 = await post('/api/session_end', { mode: 'words', count: 5, correct: 5, points: 5 });
check('earn: a 5-word session awards a fact card', e1.new_fact && e1.new_fact.text && e1.new_fact.cat,
  JSON.stringify(e1.new_fact && [e1.new_fact.cat, e1.new_fact.id]));
// a too-small session earns nothing
const eSmall = await post('/api/session_end', { mode: 'words', count: 3, correct: 3, points: 3 });
check('earn: a 3-word session awards NO card (anti-farm)', eSmall.new_fact == null);

// ---------- daily cap of 3 ----------
const got = [e1.new_fact];
for (let i = 0; i < 3; i++) {
  const e = await post('/api/session_end', { mode: 'copy', count: 5, correct: 5, points: 5 });
  got.push(e.new_fact);
}
const awarded = got.filter(Boolean);
check('cap: at most 3 cards awarded in one day', awarded.length === 3, `awarded=${awarded.length}`);
check('cap: the 4th session of the day awards nothing', got[3] == null);
const ids = awarded.map(f => f.id);
check('no repeats: every awarded card is unique', new Set(ids).size === ids.length, JSON.stringify(ids));

// ---------- state count ----------
let st = await get('/api/state');
check('state: facts_earned reflects the collection', st.facts_earned === 3 && st.facts_total === 90,
  `${st.facts_earned}/${st.facts_total}`);

// ---------- next_badge nudge ----------
// a plain session (no new badge) should carry a "what's next" badge
const eNudge = await post('/api/session_end', { mode: 'words', count: 5, correct: 4, points: 4 });
check('nudge: next_badge present on a non-badge session',
  eNudge.next_badge && eNudge.next_badge.name && typeof eNudge.next_badge.need === 'number',
  JSON.stringify(eNudge.next_badge));

// ---------- stickiness through a full reset ----------
await post('/api/parent/settings', { pin: '1234', reset_progress: true, reset_points: true });
fc = await get('/api/facts');
check('sticky: fact cards survive a progress + stars reset', fc.earned === 3, `earned=${fc.earned}`);

// ---------- UI: home chip, collection screen ----------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const chip = await page.textContent('#facts-count');
check('home: facts chip shows the earned count', parseInt(chip, 10) === 3, chip);
await page.click('#facts-btn');
await page.waitForSelector('#facts-screen.active');
await page.waitForTimeout(300);
const cards = await page.$$eval('#facts-grid .fact-card', els => els.length);
const owned = await page.$$eval('#facts-grid .fact-card:not(.locked)', els => els.length);
const cats = await page.$$eval('#facts-grid .badge-cat', els => els.length);
check('collection: renders all 90 cards in 3 decks, 3 revealed',
  cards === 90 && owned === 3 && cats === 3, `cards=${cards} owned=${owned} decks=${cats}`);
const sayBtns = await page.$$eval('#facts-grid .fc-say', els => els.length);
check('collection: owned cards have a 🔊 read button', sayBtns === 3, `say=${sayBtns}`);
await page.click('#facts-back');
await page.waitForSelector('#home.active');

// ---------- done-screen fact reveal ----------
// force a fresh child so the daily cap isn't already spent
await post('/api/parent/children', { pin: '1234', action: 'add', name: 'FactKid' });
const kid = (await get('/api/state')).children.find(c => c.name === 'FactKid').id;
const shown = await page.evaluate(k => {
  state.childId = k;
  celebrateFact({ emoji: '🦖', text: 'A test dino fact.', cat: 'dino', id: 'dino-01' });
  showNextBadge({ name: 'Bullseye', emoji: '🎯', level: 1, have: 3, need: 5 });
  const fr = document.getElementById('fact-reveal');
  return { visible: !fr.classList.contains('hidden'),
           hasText: fr.textContent.includes('A test dino fact'),
           nudge: document.getElementById('next-badge').textContent };
}, kid);
check('done: fact reveal shows the card', shown.visible && shown.hasText, JSON.stringify(shown));
check('done: badge nudge line renders "to go"', /Lv 2/.test(shown.nudge) && /to go/.test(shown.nudge), shown.nudge);

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
