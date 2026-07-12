// Fact of the day: one dino/space/LEGO fact on the home screen, no strings
// attached (owner-simplified 2026-07-12 — no collection, no award mechanics).
// Deterministic daily rotation; a 🔊 reads it aloud.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);
page.on('dialog', d => d.accept());
const get = (u) => page.evaluate(u => fetch(u).then(r => r.json()), u);
const post = (u, b) => page.evaluate(([u, b]) => fetch(u, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()), [u, b]);

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// ---------- server: the daily fact rides on /api/state ----------
const st = await get('/api/state');
check('state carries a daily fact with emoji + text',
  st.daily_fact && st.daily_fact.text && st.daily_fact.emoji,
  JSON.stringify(st.daily_fact));
const again = await get('/api/state');
check('deterministic: the same fact all day',
  again.daily_fact.text === st.daily_fact.text, '');
check('no collection mechanics: state has no facts_earned / facts_total',
  !('facts_earned' in st) && !('facts_total' in st), '');

// ---------- session_end no longer awards fact cards ----------
const end = await post('/api/session_end', { mode: 'words', count: 5, correct: 5, points: 5 });
check('session_end carries no new_fact / new_planet',
  !('new_fact' in end) && !('new_planet' in end), JSON.stringify(Object.keys(end)));

// ---------- home: the fact card renders, unconditionally ----------
check('home: the daily fact card is visible on load',
  await page.isVisible('#daily-fact'));
const cardText = await page.textContent('#df-text');
check('home: the card shows the same fact as the API', cardText === st.daily_fact.text,
  JSON.stringify(cardText));
check('home: the card has a 🔊 read-aloud button', await page.isVisible('#df-say'));

// 🔊 speaks the fact (stubbed synth)
await page.evaluate(() => { window.__spoken = [];
  window.speechSynthesis.speak = (u) => window.__spoken.push(u.text); });
await page.click('#df-say');
await page.waitForTimeout(300);
const spoken = await page.evaluate(() => window.__spoken);
check('home: 🔊 reads the fact aloud', spoken.some(t => t === st.daily_fact.text),
  JSON.stringify(spoken));

// the card is landing-only chrome: it tucks away while picking a game
await page.click('.section-card[data-section="words"]');
await page.waitForTimeout(300);
check('drill-down: the fact card gets out of the way',
  !(await page.isVisible('#daily-fact')));

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
