// Map It (Phase 5): grapheme chunking on the reveal (Elkonin boxes). The
// client graphemeSplit matches the table, rejoins over a sample of the bank,
// and the reveal renders chunked boxes (chunk gaps + heart letters in red).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);
page.on('dialog', d => d.accept());

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

// ---------- graphemeSplit: table cases ----------
const table = await page.evaluate(() => {
  const cases = { boat: ['b','oa','t'], night: ['n','igh','t'], catch: ['c','a','tch'],
    rabbit: ['r','a','bb','i','t'], said: ['s','ai','d'], hope: ['h','o','p','e'],
    queen: ['qu','ee','n'], cat: ['c','a','t'] };
  const out = {};
  for (const w in cases) out[w] = { got: graphemeSplit(w), want: cases[w] };
  return out;
});
for (const w in table) {
  check(`graphemeSplit ${w} -> ${table[w].want.join('|')}`,
    JSON.stringify(table[w].got) === JSON.stringify(table[w].want), JSON.stringify(table[w].got));
}

// ---------- rejoin invariant over the bank ----------
const rejoin = await page.evaluate(async () => {
  // pull a chunk of real words from a session to sample the bank
  const seen = new Set(); let bad = null;
  for (let i = 0; i < 6 && !bad; i++) {
    const s = await fetch('/api/session?mode=words&count=20').then(r => r.json());
    for (const it of s.items) {
      if (graphemeSplit(it.w).join('') !== it.w) { bad = it.w; break; }
      seen.add(it.w);
    }
  }
  return { count: seen.size, bad };
});
check('graphemeSplit: chunks rejoin to the word across sampled bank words',
  rejoin.bad === null && rejoin.count > 20, `sampled=${rejoin.count} bad=${rejoin.bad}`);

// ---------- the reveal renders chunked boxes ----------
// force a session on a known heart word ("boat" isn't heart; use "said" via a list)
await page.evaluate(() => fetch('/api/parent/lists', { method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pin: '1234', action: 'create', name: 'M', words: 'boat said night' }) }));
await page.evaluate(() => fetch('/api/parent/settings', { method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pin: '1234', bank_enabled: false }) }));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
// drive Hide & Spell and deliberately miss to trigger the reveal
await page.click('.section-card[data-section="words"]'); await page.waitForTimeout(150);
await page.click('.mode-card.words'); await page.waitForTimeout(150);
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active'); await page.waitForTimeout(300);
let target = await page.evaluate(() => state.target);
// type a wrong answer of the same length
const wrong = target.split('').reverse().join('') === target
  ? target.slice(0,-1) + (target.slice(-1) === 'x' ? 'y' : 'x')
  : target.split('').reverse().join('');
await page.fill('#typed', wrong.slice(0, target.length));
await page.waitForTimeout(80);
await page.click('#check');
await page.waitForTimeout(1200); // wait past the 900ms reveal
const reveal = await page.evaluate(() => {
  const wrap = document.getElementById('boxes');
  return {
    isReveal: wrap.classList.contains('reveal'),
    chunkStarts: wrap.querySelectorAll('.box.chunk-start').length,
    filled: [...wrap.querySelectorAll('.box')].map(b => b.textContent).join(''),
    heartBoxes: wrap.querySelectorAll('.box.heart-box').length,
    target: state.target,
  };
});
check('reveal: boxes show the answer', reveal.filled === reveal.target, `${reveal.filled} vs ${reveal.target}`);
check('reveal: multi-grapheme words show chunk gaps (>=1 chunk-start)',
  reveal.chunkStarts >= 1, `chunk-starts=${reveal.chunkStarts} on "${reveal.target}"`);
check('reveal: a heart word marks its heart letters red',
  reveal.target !== 'said' || reveal.heartBoxes >= 1, `heartBoxes=${reveal.heartBoxes} on "${reveal.target}"`);

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
