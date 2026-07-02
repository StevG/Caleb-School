// Heart-letter highlighting: irregular graphemes show red in prompt + reveal.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

// API: heart fields ride along on sessions
const api = await page.evaluate(async () => {
  await fetch('/api/parent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', bank_enabled: false }) });
  await fetch('/api/parent/lists', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', action: 'create', name: 'hearts', words: 'said friend people' }) });
  const w = await (await fetch('/api/session?mode=words&count=3')).json();
  const s = await (await fetch('/api/session?mode=sentences&count=6')).json();
  const heartTok = s.items.flatMap(i => i.tokens).find(t => t.heart);
  return { words: w.items, heartTok };
});
const saidItem = api.words.find(i => i.w === 'said');
check('API: word items carry heart mapping', !!saidItem && saidItem.heart === 'ai', JSON.stringify(api.words));
check('API: sentence tokens carry heart mapping', !!api.heartTok, JSON.stringify(api.heartTok));

// UI: fresh heart word at stage 1 -> red letters + heart hint
await page.click('.mode-card.words');
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
await page.waitForTimeout(300);
// find 'said' in the session (3-word pool, so it's 1st-3rd)
let found = false;
for (let i = 0; i < 4; i++) {
  const t = await page.evaluate(() => state.target);
  if (t === 'said') { found = true; break; }
  await page.focus('#typed');
  await page.fill('#typed', t);
  await page.dispatchEvent('#typed', 'input');
  await page.click('#check');
  await page.waitForTimeout(1000);
}
check('reached the heart word "said"', found);
const heartHtml = await page.$eval('#prompt-word', el => el.innerHTML);
const heartText = await page.$$eval('#prompt-word .heart', els => els.map(e => e.textContent).join(''));
check('prompt highlights the tricky part red', heartText === 'ai', `spans="${heartText}" html=${heartHtml}`);
const hint = (await page.textContent('#prompt-hint')).trim();
check('stage-1 hint explains heart words', hint.includes('♥') || hint.toLowerCase().includes('heart'), hint);

// wrong answer -> the reveal also shows the heart letters + heart hint
await page.focus('#typed');
await page.fill('#typed', 'zzzz');
await page.dispatchEvent('#typed', 'input');
await page.click('#check');
await page.waitForTimeout(1100);
const revealHearts = await page.$$eval('#prompt-word .heart', els => els.map(e => e.textContent).join(''));
const revealHint = (await page.textContent('#prompt-hint')).trim();
check('reveal keeps the red heart letters', revealHearts === 'ai', revealHearts);
check('reveal hint teaches the heart part', revealHint.includes('♥'), revealHint);

// non-heart words render plain (no spans)
await page.evaluate(() => {
  // restore bank for other suites
  return fetch('/api/parent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', bank_enabled: true }) });
});
const plain = await page.evaluate(() => heartSpans('cat', null));
const multi = await page.evaluate(() => heartSpans('come', 'o-e'));
const cased = await page.evaluate(() => heartSpans('Said', 'ai'));
check('heartSpans: plain word untouched', plain === 'cat', plain);
check('heartSpans: split grapheme o-e wraps both', multi === 'c<span class="heart">o</span>m<span class="heart">e</span>', multi);
check('heartSpans: matches case-insensitively', cased.includes('<span class="heart">ai</span>'), cased);

// ---- parent dashboard: ♥ markers + the "heart words only" filter ----
await page.click('#quit');
await page.waitForSelector('#home.active');
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForTimeout(600);

// heart words show a ♥ to the right of the word — in the bank bands...
await page.evaluate(() => {
  document.querySelector('#bank-wrap details.wlist').open = true;
  document.querySelector('#bank-wrap details.band').open = true;
});
const bandHeart = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#bank-wrap details.band .word-row')];
  const withHeart = rows.find(r => r.querySelector('.wr-heart'));
  return withHeart ? withHeart.querySelector('.wr-word').textContent.trim() : null;
});
check('bank rows mark heart words with ♥', !!bandHeart, `first: "${bandHeart}"`);

// ...and in custom lists ("said" is a heart word, from the list made above)
await page.evaluate(() => {
  document.querySelector('#lists-wrap details.wlist').open = true;
});
const listHeart = await page.evaluate(() => {
  const row = [...document.querySelectorAll('#lists-wrap .word-row')]
    .find(r => r.querySelector('.wr-word').textContent.includes('said'));
  return { heart: !!row?.querySelector('.wr-heart'),
           plain: [...document.querySelectorAll('#lists-wrap .word-row')]
             .find(r => r.querySelector('.wr-word').textContent.includes('friend'))
             ?.querySelectorAll('.wr-heart').length === 1 };
});
check('list rows mark heart words with ♥', listHeart.heart, JSON.stringify(listHeart));

// the "Heart words only" toggle: shows a count, persists, filters sessions
const noteBefore = (await page.textContent('#hearts-note')).trim();
check('hearts-only note counts hearts in the selection', /^\d+ available$/.test(noteBefore), noteBefore);
await page.click('#hearts-only');
await page.waitForTimeout(400);
const noteAfter = (await page.textContent('#hearts-note')).trim();
check('checked: note flips to "practicing N"', /^practicing \d+$/.test(noteAfter), noteAfter);
const heartsState = await page.evaluate(async () => {
  const rep = await (await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } })).json();
  const sess = await (await fetch('/api/session?mode=words&count=15')).json();
  return { saved: rep.profile.hearts_only,
           allHearts: sess.items.length > 0 && sess.items.every(i => i.heart) };
});
check('hearts-only persists to the server', heartsState.saved === true);
check('hearts-only session: every word is a heart word', heartsState.allHearts);

// no hearts in the selection -> falls back to ALL heart words, never empty
const fallback = await page.evaluate(async () => {
  await fetch('/api/parent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', bank_enabled: false }) });
  await fetch('/api/parent/lists', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', action: 'create', name: 'no hearts', words: 'tent lamp desk' }) });
  // switch the heart-bearing list off so the selection truly has zero hearts
  const rep = await (await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } })).json();
  const heartsList = rep.lists.find(l => l.name === 'hearts');
  await fetch('/api/parent/lists', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', action: 'toggle_list', list_id: heartsList.id, enabled: false }) });
  const sess = await (await fetch('/api/session?mode=words&count=8')).json();
  // restore for any later suites
  await fetch('/api/parent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', bank_enabled: true, hearts_only: false }) });
  return { n: sess.items.length, allHearts: sess.items.every(i => i.heart) };
});
check('hearts-only with no hearts selected: falls back to all heart words',
  fallback.n === 8 && fallback.allHearts, JSON.stringify(fallback));

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
