// Badges: the catalog + tier engine, retroactive seeding, live earning with
// star payouts, celebration on the done screen, the badge case + parent strip,
// per-child isolation, and reset immunity (trophies never un-earn).
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

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

// fresh child: 14 badges, none earned
let bd = await page.evaluate(() => fetch('/api/badges').then(r => r.json()));
check('catalog: 14 badges, none earned on a fresh child',
  bd.total === 14 && bd.earned === 0 && bd.badges.length === 14, `total=${bd.total} earned=${bd.earned}`);
check('every badge has 4 tiers + accent + emoji',
  bd.badges.every(b => b.tiers.length === 4 && b.accent && b.emoji), '');

// earn: a perfect, fast 10-word game -> Bullseye, Hot Streak, Speed of Light + stars
for (let i = 0; i < 10; i++) await post('/api/answer', { word: 'cat', correct: true, mode: 'words' });
const end = await post('/api/session_end', { mode: 'words', count: 10, correct: 10, points: 10, seconds: 90 });
const names = end.new_badges.map(b => b.name);
check('earn: perfect fast game earns Bullseye + Hot Streak + Speed of Light',
  names.includes('Bullseye') && names.includes('Hot Streak') && names.includes('Speed of Light'),
  JSON.stringify(names));
check('earn: response carries the star payout per level',
  end.new_badges.every(b => typeof b.stars === 'number'), JSON.stringify(end.new_badges.map(b => [b.name, b.level, b.stars])));
const speed = end.new_badges.find(b => b.name === 'Speed of Light');
check('earn: 9s/word crosses L1(15) L2(12) L3(9) -> Level 3, stars 5+10+15=30',
  speed.level === 3 && speed.stars === 30, JSON.stringify(speed));
check('earn: stars were added to points (10 answers + 40 badge stars = 50)',
  end.points === 50, String(end.points));

// perfect games counter climbs Bullseye across sessions
for (let s = 0; s < 4; s++) {
  for (let i = 0; i < 5; i++) await post('/api/answer', { word: 'dog', correct: true, mode: 'copy' });
  await post('/api/session_end', { mode: 'copy', count: 5, correct: 5, points: 5, seconds: 60 });
}
bd = await page.evaluate(() => fetch('/api/badges').then(r => r.json()));
const bull = bd.badges.find(b => b.id === 'bullseye');
check('Bullseye reaches Level 2 after 5 perfect games', bull.level === 2 && bull.value === 5, JSON.stringify(bull));

// a MISS breaks Hot Streak but the earned level stays (trophies are sticky)
await post('/api/answer', { word: 'zzz', correct: false, mode: 'words' });
bd = await page.evaluate(() => fetch('/api/badges').then(r => r.json()));
const streak = bd.badges.find(b => b.id === 'streak');
check('Hot Streak keeps its earned level after a miss', streak.level >= 1, JSON.stringify(streak));

// reset practice progress -> badges & their levels SURVIVE (immune to reset)
const earnedBefore = bd.earned;
await post('/api/parent/settings', { pin: '1234', reset_progress: true, reset_points: true });
bd = await page.evaluate(() => fetch('/api/badges').then(r => r.json()));
check('reset immunity: earned badge count survives a full progress reset',
  bd.earned === earnedBefore, `${earnedBefore} -> ${bd.earned}`);
check('reset immunity: Speed of Light keeps Level 3',
  bd.badges.find(b => b.id === 'speed').level === 3);

// per-child isolation: a sibling starts with zero badges
await post('/api/parent/children', { pin: '1234', action: 'add', name: 'Sib' });
const sibBd = await page.evaluate(() => fetch('/api/badges?child=c2').then(r => r.json()));
check('per-child: a new sibling has 0 badges', sibBd.earned === 0, String(sibBd.earned));

// ---------- UI: home chip, badge case, detail, parent strip ----------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const chip = await page.textContent('#badges-count');
check('home: badge chip shows the earned count', parseInt(chip, 10) === bd.earned, `${chip} vs ${bd.earned}`);
await page.click('#badges-btn');
await page.waitForTimeout(400);
const cells = await page.$$eval('.badge-cell', els => els.length);
const plated = await page.$$eval('.badge-cell:not(.locked) .badge-svg polygon', els => els.length);
check('badge case: all 14 cells render, earned ones have plates', cells === 14 && plated > 0, `cells=${cells} plates=${plated}`);
await page.click('.badge-cell');
await page.waitForTimeout(200);
const detailOpen = await page.$eval('#badge-detail', el => !el.classList.contains('hidden'));
const detailName = await page.textContent('#bd-name');
check('badge case: tapping a badge opens its detail', detailOpen && detailName.length > 0, detailName);
await page.click('#bd-close');
check('badge detail closes', await page.$eval('#badge-detail', el => el.classList.contains('hidden')));
await page.click('#badges-back');
await page.waitForSelector('#home.active');

// parent strip
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForTimeout(600);
const strip = await page.$$eval('#p-badge-strip .p-badge', els => els.length);
const pcount = await page.textContent('#p-badge-count');
check('parent: badges strip renders with an earned/total count',
  strip > 0 && /^\d+\/14$/.test(pcount), `cells=${strip} count=${pcount}`);

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
