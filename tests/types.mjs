// Targeted spelling: clickable session drill-down (per-word ✓/✗ with the
// word's category), the "Word types" analysis card (per-category accuracy,
// one-tap assign), assignments by category / whole grade, and the bank's
// category-first view (pick TYPES under each grade, expand to see words).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);
const report = () => page.evaluate(async () =>
  await (await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } })).json());

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

// ---- 1. kid plays a session (one deliberate miss) -> per-word results ----
await page.click('.section-card.sec-words'); await page.click('.mode-card.words');
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
let missedWord = '';
for (let guard = 0; guard < 18; guard++) {
  if (await page.evaluate(() => $("done").classList.contains('active'))) break;
  await page.waitForFunction(() => state.target && !state.locked && !state.answered,
    null, { timeout: 8000 });
  const target = await page.evaluate(() => state.target);
  if (!missedWord) {
    missedWord = target; // miss it once, then fix it (aided — still ✗)
    const wrong = (target[0] === 'z' ? 'a' : 'z') + target.slice(1);
    await page.fill('#typed', wrong); await page.dispatchEvent('#typed', 'input');
    await page.click('#check');
    await page.waitForTimeout(1200);          // reveal
    await page.click('#next');                // "Try again"
    await page.waitForTimeout(300);
  }
  await page.fill('#typed', target); await page.dispatchEvent('#typed', 'input');
  await page.click('#check');
  await page.waitForTimeout(1050);            // auto-advance
}
await page.waitForSelector('#done.active', { timeout: 6000 });
let rep = await report();
const sess = rep.recent_sessions[0];
check('session_end stores per-word results (requeued word = its own line)',
  Array.isArray(sess.words) && sess.words.length === sess.count &&
  sess.words.filter(w => w.w === missedWord).length === 2,
  `count=${sess.count} words=${(sess.words || []).length} missed="${missedWord}"`);
const missLine = (sess.words || []).find(w => w.w === missedWord && !w.ok);
check('the missed word is marked ✗ and tagged with its category',
  !!missLine && typeof missLine.group === 'string' && missLine.group.length > 0,
  JSON.stringify(missLine));
check('right-first-try words are marked ✓',
  (sess.words || []).some(w => w.ok));

// ---- 2. parent UI: session row opens to the actual words ----
await page.click('[data-home]').catch(() => {});
await page.evaluate(() => show('home'));
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForTimeout(700);
const sessUI = await page.evaluate(() => {
  const det = document.querySelector('#sessions-list details.sess');
  if (!det) return null;
  det.open = true;
  const rows = [...det.querySelectorAll('.sess-word')];
  return { rows: rows.length,
           firstIsMiss: rows[0]?.classList.contains('miss'),
           firstMark: rows[0]?.querySelector('.sw-mark')?.textContent,
           firstGroup: rows[0]?.querySelector('.sw-group')?.textContent || '' };
});
check('recent session is clickable and lists the words, misses first',
  !!sessUI && sessUI.rows >= 10 && sessUI.firstIsMiss && sessUI.firstMark === '✗',
  JSON.stringify(sessUI));
check('each word row shows its word type', !!sessUI && sessUI.firstGroup.length > 0,
  sessUI?.firstGroup);

// ---- 3. word-type analysis: a struggling category floats up ----
// seed 2 misses on each of three oi/oy words (6 tries, 0% -> needs work)
await page.evaluate(async () => {
  for (const w of ['coin', 'enjoy', 'royal']) {
    for (let i = 0; i < 2; i++) {
      await fetch('/api/answer', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: w, correct: false, mode: 'words' }) });
    }
  }
});
rep = await report();
const oiEntry = (rep.by_type || []).find(t => t.name === 'oi / oy');
check('by_type flags the struggling category (6+ tries, <80%)',
  !!oiEntry && oiEntry.needs_work === true && oiEntry.accuracy === 0 &&
  oiEntry.practiced === 3 && oiEntry.trouble.length === 3,
  JSON.stringify(oiEntry));
check('by_type sorts the needs-work category to the top',
  (rep.by_type || [])[0]?.name === 'oi / oy');
check('type_groups catalog ships all 67 categories',
  (rep.type_groups || []).length === 67 &&
  rep.type_groups.filter(g => g.general).length === 17);

// the card shows it with an Assign practice button — click it
await page.evaluate(() => window.openParent());
await page.waitForTimeout(600);
const typeRow = await page.evaluate(() => {
  const row = document.querySelector('#types-list .type-row.needs-work');
  return row ? { name: row.querySelector('.type-name').textContent,
                 acc: row.querySelector('.type-acc').textContent,
                 low: row.querySelector('.type-acc').classList.contains('low'),
                 btn: !!row.querySelector('.type-assign') } : null;
});
check('Word types card: struggling category with accuracy + assign button',
  !!typeRow && typeRow.name.includes('oi / oy') && typeRow.low && typeRow.btn,
  JSON.stringify(typeRow));
await page.click('#types-list .type-row.needs-work .type-assign');
await page.waitForTimeout(800);
rep = await report();
const mission = rep.assignments.todo.find(a => a.group === 'oi / oy');
check('one tap assigns a Hide & Spell mission on just that category',
  !!mission && mission.mode === 'words' && mission.name === 'oi / oy',
  JSON.stringify(rep.assignments.todo));

// ---- 4. the mission practices ONLY that category, misses first ----
const missionSess = await page.evaluate(async (aid) =>
  await (await fetch(`/api/session?mode=words&count=10&assignment=${aid}`)).json(),
  mission.id);
const groups = [...new Set(missionSess.items.map(i => i.group))];
const missionWords = new Set(missionSess.items.map(i => i.w));
check('category mission: every word is from that category',
  groups.length === 1 && groups[0] === 'oi / oy' && missionSess.items.length === 10,
  JSON.stringify(groups));
check('category mission: all his missed words are selected (order shuffled — it\'s a test)',
  ['coin', 'enjoy', 'royal'].every(w => missionWords.has(w)),
  JSON.stringify([...missionWords]));

// ---- 5. assign a whole grade band from the dropdown ----
const optInfo = await page.evaluate(() => ({
  types: document.querySelectorAll('#assign-list optgroup[label="Word types"] option').length,
  grades: document.querySelectorAll('#assign-list optgroup[label="Whole grades"] option').length }));
check('assign dropdown offers word types and whole grades',
  optInfo.types === 50 && optInfo.grades === 17, JSON.stringify(optInfo));
await page.selectOption('#assign-mode', 'words');
await page.selectOption('#assign-list', 'band:1');
await page.click('#assign-create');
await page.waitForTimeout(800);
rep = await report();
const gradeMission = rep.assignments.todo.find(a => a.level === 1);
check('whole-grade mission created', !!gradeMission &&
  gradeMission.name === 'Grade 1 words', JSON.stringify(rep.assignments.todo));
const gradeSess = await page.evaluate(async (aid) =>
  await (await fetch(`/api/session?mode=words&count=10&assignment=${aid}`)).json(),
  gradeMission.id);
check('whole-grade mission: words come from that grade',
  gradeSess.items.length === 10 &&
  gradeSess.items.every(i => i.group === 'Grade 1 · early'),
  JSON.stringify([...new Set(gradeSess.items.map(i => i.group))]));

// ---- 6. the bank is category-first: pick types, expand to see words ----
await page.evaluate(() => {
  document.querySelector('#bank-wrap details.wlist').open = true;
  document.querySelectorAll('#bank-wrap details.band')[2].open = true; // 2nd grade
});
const bankUI = await page.evaluate(() => {
  const band = document.querySelectorAll('#bank-wrap details.band')[2];
  const grp = band.querySelector('details.bank-group');
  grp.open = true;
  return { nGroups: band.querySelectorAll('details.bank-group').length,
           first: grp.querySelector('.list-name').textContent,
           count: grp.querySelector('.list-count').textContent.trim(),
           words: grp.querySelectorAll('.word-row').length,
           copyBtn: grp.querySelector('.wlist-actions button')?.textContent || '' };
});
check('a grade splits into named categories with on:total counts',
  bankUI.nGroups > 10 && /^\d+:\d+$/.test(bankUI.count) &&
  bankUI.first === 'Silent-e (a_e)', JSON.stringify(bankUI));
check('opening a category shows the words inside',
  bankUI.words === parseInt(bankUI.count.split(':')[1], 10), String(bankUI.words));

// toggle the whole category off -> every word of it goes off, band count drops
const grpSize = parseInt(bankUI.count.split(':')[1], 10);
const bandBefore = await page.evaluate(() =>
  document.querySelectorAll('#bank-wrap details.band')[2]
    .querySelector(':scope > summary .list-count').textContent.trim());
await page.click('#bank-wrap .bank-body > details.band:nth-of-type(3) details.bank-group > summary input');
await page.waitForTimeout(600);
rep = await report();
const grpAfter = rep.bank.bands[2].groups[0];
const bandAfter = rep.bank.bands[2];
check('category checkbox off: all its words switch off, band count drops',
  grpAfter.enabled_count === 0 && grpAfter.words.every(w => !w.on) &&
  bandAfter.enabled_count === parseInt(bandBefore, 10) - grpSize,
  `group=${grpAfter.enabled_count} band=${bandBefore}->${bandAfter.enabled_count}`);
const greyed = await page.evaluate(() =>
  document.querySelectorAll('#bank-wrap details.band')[2]
    .querySelector('details.bank-group').classList.contains('grp-off'));
check('switched-off category greys out (checkmarks remembered)', greyed);
// back on -> everything returns
await page.click('#bank-wrap .bank-body > details.band:nth-of-type(3) details.bank-group > summary input');
await page.waitForTimeout(600);
rep = await report();
check('category back on: every word active again',
  rep.bank.bands[2].groups[0].enabled_count === grpSize);

// ---- 7. copy one category into a school list (no typing) ----
await page.evaluate(() => {
  document.querySelector('#bank-wrap details.wlist').open = true;
  const band = document.querySelectorAll('#bank-wrap details.band')[2];
  band.open = true;
  band.querySelector('details.bank-group').open = true;
});
await page.click('#bank-wrap .bank-body > details.band:nth-of-type(3) details.bank-group .wlist-actions button');
await page.waitForTimeout(600);
rep = await report();
const copiedList = (rep.lists || []).find(l => l.name === 'Silent-e (a_e)');
check('category copies into its own school list',
  !!copiedList && copiedList.total === grpSize, JSON.stringify(rep.lists.map(l => l.name)));

// ---- 8. session words are sanitized server-side ----
await page.evaluate(async () => {
  const junk = Array.from({ length: 70 }, (_, i) =>
    i === 0 ? { w: 'x'.repeat(99), ok: 'yes' } : { w: `w${i}`, ok: i % 2 === 0 });
  junk.push(42, null, 'nope');
  await fetch('/api/session_end', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'words', count: 5, correct: 5, points: 5, words: junk }) });
});
rep = await report();
const last = rep.recent_sessions[0];
check('junk words payload: capped at 60, strings trimmed, ok coerced to bool',
  last.words.length <= 60 && last.words[0].w.length <= 32 &&
  last.words.every(w => typeof w.ok === 'boolean'),
  `n=${last.words.length} first=${last.words[0].w.length} chars`);

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
