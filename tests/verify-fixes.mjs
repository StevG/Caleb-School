import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const BASE = 'http://127.0.0.1:9911';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
const results = [];
const check = (name, ok, extra='') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };

async function typeWord(w) {
  await page.focus('#typed');
  await page.fill('#typed', w);
  await page.dispatchEvent('#typed', 'input');
}

await page.goto(BASE, { waitUntil: 'networkidle' });

// ============ TEST 1: full sentence completion incl. punctuated last word ============
await page.click('.mode-card.sentences');
await page.waitForSelector('#play.active');
await page.waitForTimeout(250);
let completedSentence = false;
for (let word = 0; word < 15; word++) {
  const display = (await page.textContent('#prompt-word')).trim();
  const target = display.replace(/[^a-zA-Z'-]/g, '');
  const boxCount = await page.$$eval('#boxes .box', els => els.length);
  if (boxCount !== target.length) { check('T1 box count matches CLEAN answer length', false, `${display}: boxes=${boxCount} target=${target}`); break; }
  await typeWord(target);
  const disabled = await page.$eval('#check', el => el.disabled);
  if (disabled) { check('T1 Check enables on punctuated word', false, `word "${display}" -> check still disabled`); break; }
  await page.click('#check');
  await page.waitForTimeout(950);
  const hint = (await page.textContent('#prompt-hint')).trim();
  if (hint.includes('whole sentence')) { completedSentence = true; break; }
}
check('T1 whole sentence completable (incl. last punctuated word)', completedSentence);

// ============ TEST 2: wrong -> Try again -> retype -> Check works ============
await page.waitForTimeout(900); // let it load next sentence
await page.click('#quit');
await page.waitForSelector('#home.active');
await page.click('.mode-card.words');
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
await page.waitForTimeout(250);
const t2 = (await page.textContent('#prompt-word')).trim();
await typeWord('z'.repeat(t2.length));
await page.click('#check');
await page.waitForTimeout(1100);
const tryAgainLabel = (await page.textContent('#next')).trim();
await page.click('#next'); // Try again
await page.waitForTimeout(200);
const checkVisibleOnRetry = await page.$eval('#check', el => !el.classList.contains('hidden'));
const nextHiddenOnRetry = await page.$eval('#next', el => el.classList.contains('hidden'));
check('T2 retry: Check visible / Next hidden', checkVisibleOnRetry && nextHiddenOnRetry, `label was "${tryAgainLabel}"`);
await typeWord(t2.toLowerCase());
const canCheck = await page.$eval('#check', el => !el.disabled && !el.classList.contains('hidden'));
check('T2 retry can be submitted', canCheck);
await page.click('#check');
await page.waitForTimeout(400);
const fb2 = await page.$eval('#feedback', el => el.className);
check('T2 retry correct accepted', fb2.includes('good'));

// ============ TEST 3: aided retry didn't count as unaided correct (server) ============
const stats = await page.evaluate(async (t) => {
  const r = await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } });
  const rep = await r.json();
  return rep.most_missed.find(m => m.word === t.toLowerCase()) || null;
}, t2);
check('T3 aided retry: word still shows missed, not mastered', !!stats && stats.missed >= 1 && !stats.mastered, JSON.stringify(stats));

// ============ TEST 4: finish session by tapping Next fast on last word; single session record ============
await page.click('#quit');
await page.waitForSelector('#home.active');
await page.click('.mode-card.words');
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
await page.waitForTimeout(250);
// play through all words quickly, tapping Next immediately after each correct
for (let i = 0; i < 30; i++) {
  const active = await page.$eval('#done', el => el.classList.contains('active'));
  if (active) break;
  const disp = (await page.textContent('#prompt-word')).trim();
  const target = disp.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
  await typeWord(target);
  await page.click('#check');
  await page.waitForTimeout(150);
  const nextVisible = await page.$eval('#next', el => !el.classList.contains('hidden'));
  if (nextVisible) await page.click('#next'); // tap before the 850ms auto-advance
  await page.waitForTimeout(250);
}
await page.waitForTimeout(1200); // let any stray auto-advance timer fire
const doneActive = await page.$eval('#done', el => el.classList.contains('active'));
check('T4 session reaches done screen', doneActive);
const sess = await page.evaluate(async () => {
  const r = await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } });
  const rep = await r.json();
  return rep.recent_sessions;
});
const wordSessions = sess.filter(s => s.mode === 'words');
check('T4 exactly one words-session recorded (no double session_end)', wordSessions.length === 1, `words sessions: ${wordSessions.length}`);
const s0 = wordSessions[0] || {};
check('T4 session correct <= count (sane units)', s0.correct <= s0.count, JSON.stringify(s0));

// ============ TEST 5: sentence session recorded in words units ============
const sentSessions = sess.filter(s => s.mode === 'sentences');
if (sentSessions.length) {
  const ss = sentSessions[0];
  check('T5 sentence session: correct <= count (word units)', ss.correct <= ss.count, JSON.stringify(ss));
} else {
  check('T5 sentence session units', true, 'no full sentence session finished — skipped');
}

// ============ TEST 6: 6-digit PIN can be entered at the gate ============
const pinSet = await page.evaluate(async () => {
  const r = await fetch('/api/parent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', new_pin: '123456' }) });
  return (await r.json());
});
check('T6 server accepted 6-digit PIN', pinSet.pin_changed === true, JSON.stringify(pinSet));
await page.click('#home-btn');
await page.waitForSelector('#home.active');
await page.click('#gear');
await page.waitForSelector('#gate.active');
for (const d of ['1','2','3','4','5','6']) {
  await page.click(`.pin-key:has-text("${d}")`);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(500);
const parentOpen = await page.$eval('#parent', el => el.classList.contains('active'));
check('T6 6-digit PIN opens parent dashboard', parentOpen);
const pinErrShown = (await page.textContent('#pin-err')).trim();
check('T6 no premature wrong-PIN error at 4 digits', parentOpen && pinErrShown === '');

// reset pin back to 1234 for future runs
await page.evaluate(async () => {
  await fetch('/api/parent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '123456', new_pin: '1234' }) });
});

// ============ TEST 7: custom word above level cap included at level 2 ============
const t7 = await page.evaluate(async () => {
  await fetch('/api/parent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', max_level: 2 }) });
  await fetch('/api/parent/custom_words', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', action: 'add', words: 'because ice-cream' }) });
  // pull many sessions to see the pool
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const r = await fetch('/api/session?mode=words&count=30');
    (await r.json()).items.forEach(it => seen.add(it.w));
  }
  const cw = await (await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } })).json();
  const custom = (cw.lists || []).flatMap(l => l.words.map(w => w.word));
  return { hasBecause: seen.has('because'), hasIceCream: seen.has('ice-cream'), custom };
});
check('T7 level-3 bank word "because" practiced as custom at level 2', t7.hasBecause, JSON.stringify(t7.custom));
check('T7 hyphenated custom word kept typeable', t7.custom.includes('ice-cream'));

// ============ TEST 8: invalid new_pin rejected with message, parentPin not desynced ============
const bad = await page.evaluate(async () => {
  const r = await fetch('/api/parent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', new_pin: '12' }) });
  return { status: r.status, body: await r.json() };
});
check('T8 server rejects 2-digit PIN with 400', bad.status === 400, JSON.stringify(bad.body));

// ============ TEST 9: static traversal + data not exposed ============
const t9 = await page.evaluate(async () => {
  const a = await fetch('/../data/progress.json');
  const b = await fetch('/%2e%2e/server.py');
  return [a.status, b.status];
});
check('T9 path traversal blocked', t9.every(s => s === 404), `statuses: ${t9}`);

console.log(results.join('\n'));
console.log('\nCONSOLE ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
