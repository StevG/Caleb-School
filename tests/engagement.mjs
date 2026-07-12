// Engagement / anti-frustration features (Phase 1):
//   Today's Quest one-tap session, warm-start ordering, home greeting chips,
//   the "Show me again" peek (aided, never a miss), closeness feedback.
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

// ---------- /api/state greeting + quest fields ----------
let st = await get('/api/state');
check('state carries greeting + quest fields',
  'streak_days' in st && 'yesterday' in st && 'quest_done_today' in st && 'practiced_today' in st,
  JSON.stringify({s: st.streak_days, y: st.yesterday, q: st.quest_done_today}));
check('fresh child: quest not done yet', st.quest_done_today === false && typeof st.streak_days === 'number');

// ---------- quest session endpoint ----------
const q = await get('/api/session?quest=1');
check('quest session: 5-word Hide & Spell set', q.mode === 'words' && q.quest === true && q.items.length === 5,
  `mode=${q.mode} quest=${q.quest} n=${q.items.length}`);

// ---------- quest card in the UI ----------
check('home: Quest card is visible', await page.isVisible('#quest-card'));
const subBefore = await page.textContent('#quest-sub');
await page.click('#quest-card');
await page.waitForSelector('#play.active', { timeout: 3000 });
const items = await page.evaluate(() => state.total);
check('quest tap: one tap reaches play with 5 items', items === 5, `total=${items}`);

// finish it by playing through (peek+type each so we never miss)
async function playThrough() {
  for (let guard = 0; guard < 40; guard++) {
    if (await page.isVisible('#done.active')) return true;
    if (!(await page.isVisible('#play.active'))) return false;
    // reveal the word (peek) then type it
    if (await page.isVisible('#peek-btn')) await page.click('#peek-btn').catch(()=>{});
    await page.waitForTimeout(120);
    const t = (await page.textContent('#prompt-word')).trim();
    if (!t) { await page.waitForTimeout(150); continue; }
    await page.fill('#typed', t);
    await page.waitForTimeout(80);
    if (await page.isVisible('#check') && !(await page.getAttribute('#check','class')).includes('hidden')) {
      await page.click('#check').catch(()=>{});
    }
    await page.waitForTimeout(400);
    if (await page.isVisible('#next') && !(await page.getAttribute('#next','class')).includes('hidden')) {
      await page.click('#next').catch(()=>{});
    }
    await page.waitForTimeout(200);
  }
  return await page.isVisible('#done.active');
}
const done = await playThrough();
check('quest: playing through reaches the done screen', done);
check('quest done screen shows "One more game?"', await page.isVisible('#more-games'));
await page.click('#home-btn');
await page.waitForSelector('#home.active');
await page.waitForTimeout(300);
check('home: Quest card flips to done state after finishing',
  await page.evaluate(() => document.getElementById('quest-card').classList.contains('quest-done')));
st = await get('/api/state');
check('state: quest_done_today true after finishing', st.quest_done_today === true);

// quest reward counts once per day
const before = await page.evaluate(() => fetch('/api/badges').then(()=>0)); // no-op to keep order
const e1 = await post('/api/session_end', { mode: 'words', count: 5, correct: 5, points: 5, quest: true });
check('quest: second finish same day still reports done', e1.quest_done_today === true);

// ---------- greeting chips (render logic) ----------
const chips = await page.evaluate(() => {
  renderGreeting({ streak_days: 4, yesterday: { points: 23 }, practiced_today: false });
  return document.getElementById('greeting-chips').innerHTML;
});
check('greeting: streak chip shows on 2+ days', /Day 4/.test(chips), chips);
check('greeting: yesterday chip shows when not practiced today', /23/.test(chips), chips);
const chips2 = await page.evaluate(() => {
  renderGreeting({ streak_days: 1, yesterday: { points: 9 }, practiced_today: true });
  const el = document.getElementById('greeting-chips');
  return { html: el.innerHTML, hidden: el.classList.contains('hidden') };
});
check('greeting: no streak chip on day 1, no yesterday chip once practiced today',
  chips2.hidden && chips2.html === '', JSON.stringify(chips2));

// ---------- warm-start ordering ----------
// isolate the pool to a small custom list so the order is checkable
await post('/api/parent/lists', { pin: '1234', action: 'create', name: 'WS',
  words: 'zebra apple mat pin ox cot' });
await post('/api/parent/settings', { pin: '1234', bank_enabled: false });
// make "mat" a proven word (streak >= 2, no misses) via Copy It (never masters)
await post('/api/answer', { word: 'mat', correct: true, mode: 'copy' });
await post('/api/answer', { word: 'mat', correct: true, mode: 'copy' });
let firstIsProven = 0, N = 12;
for (let i = 0; i < N; i++) {
  const s = await get('/api/session?mode=words&count=6');
  if (s.items[0] && s.items[0].w === 'mat') firstIsProven++;
}
check('warm-start: the proven word leads every session', firstIsProven === N, `${firstIsProven}/${N}`);

// ---------- peek is aided, never a miss (no ladder climb, no requeue) ----------
// fresh child to keep the ladder clean
await post('/api/parent/children', { pin: '1234', action: 'add', name: 'Peek' });
const kid = (await get('/api/state')).children.find(c => c.name === 'Peek').id;
// simulate the client's peek path: a correct answer posted as aided
await post('/api/answer', { word: 'lamp', correct: true, aided: true, mode: 'words', child: kid });
const rep = await page.evaluate(k => fetch('/api/state?child=' + k).then(r => r.json()), kid);
// aided answers earn a star but must not advance the ladder; check via badges metric stage_ups
const bd = await page.evaluate(k => fetch('/api/badges?child=' + k).then(r => r.json()), kid);
const climber = bd.badges.find(b => b.id === 'climber');
check('peek/aided: an aided correct does NOT climb the ladder (0 level-ups)', climber.value === 0, `stage_ups=${climber.value}`);
check('peek/aided: an aided correct still earns a star', rep.points >= 1, `points=${rep.points}`);

// ---------- closeness feedback (unit-level on the client) ----------
const msgs = await page.evaluate(() => {
  const out = {};
  state.caseSensitive = false;
  state.target = 'plant';
  out.one = closenessMessage('plont');   // one letter off
  out.swap = closenessMessage('palnt');  // two adjacent swapped
  state.target = 'frog';
  out.half = closenessMessage('frxx');   // two of four wrong -> "2 letters right"
  out.far = closenessMessage('xxxx');    // all wrong
  return out;
});
check('closeness: one-letter-off message', /ONE letter/.test(msgs.one), msgs.one);
check('closeness: swapped-letters message', /swapped/.test(msgs.swap), msgs.swap);
check('closeness: mostly-right message', /letters right/.test(msgs.half), msgs.half);
check('closeness: all-wrong falls back to gentle default', /Look again/.test(msgs.far), msgs.far);

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
