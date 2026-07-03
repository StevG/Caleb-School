// Per-child "auto-play audio when a word is shown": says the word then spells
// it out in Copy It / Hide & Spell, stops the moment the kid types, and never
// spells in Listen & Spell (that would give the answer away). Uses a
// controllable speechSynthesis stub to read the spoken text.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);

const installStub = () => page.evaluate(() => {
  window.__log = [];
  const stub = { speaking: false, pending: false, resume() {},
    cancel() { window.__log.push('CANCEL'); this.speaking = false; },
    speak(u) { window.__log.push('SPEAK:' + u.text); this.speaking = true; if (u.onstart) u.onstart(); } };
  Object.defineProperty(window, 'speechSynthesis', { value: stub, configurable: true });
});
const spellOf = (w) => w.split('').map(c => ({ "'": 'apostrophe', '-': 'dash' }[c] || c)).join('. ');

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

// default OFF: a shown word is NOT auto-spoken
await installStub();
await page.click('.section-card.sec-words'); await page.click('.mode-card.words'); await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active'); await page.waitForTimeout(400);
// (SPEAK: with no text is the silent iOS audio-unlock — not a real word)
const offSpoke = await page.evaluate(() => window.__log.filter(l => l.startsWith('SPEAK:') && l.length > 6));
check('default off: no audio when a word is shown', offSpoke.length === 0, JSON.stringify(offSpoke));
await page.click('#quit'); await page.waitForSelector('#home.active');

// the setting persists per child (server round-trip)
const saved = await page.evaluate(async () => {
  await fetch('/api/parent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', autoplay_audio: true }) });
  const rep = await (await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } })).json();
  const st = await (await fetch('/api/state')).json();
  return { report: rep.profile.autoplay_audio, state: st.autoplay_audio };
});
check('setting persists (report + kid state)', saved.report === true && saved.state === true, JSON.stringify(saved));

// reload so the kid client picks it up, re-install the stub
await page.reload({ waitUntil: 'networkidle' });
await installStub();
await page.waitForTimeout(150);

// Hide & Spell: auto-play says the word, then spells it
await page.click('.section-card.sec-words'); await page.click('.mode-card.words'); await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active'); await page.waitForTimeout(400);
let target = await page.evaluate(() => state.target);
let spoke = await page.evaluate(() => window.__log.filter(l => l.startsWith('SPEAK:') && l.length > 7));
check('Hide & Spell: auto-play says the word then spells it',
  spoke[spoke.length - 1] === `SPEAK:${target}. ${spellOf(target)}`, JSON.stringify(spoke.slice(-1)));

// typing stops the audio (so the spelling can't be copied)
await page.evaluate(() => { window.__log = []; });
await page.focus('#typed'); await page.type('#typed', target[0]); await page.waitForTimeout(150);
check('typing stops the audio', await page.evaluate(() => window.__log.includes('CANCEL')));
await page.fill('#typed', target); await page.dispatchEvent('#typed', 'input');
await page.click('#check'); await page.waitForTimeout(1100);
await page.click('#quit'); await page.waitForSelector('#home.active');

// Copy It: also auto-plays word + spelling
await installStub();
await page.click('.section-card.sec-words'); await page.click('.mode-card.copy'); await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active'); await page.waitForTimeout(400);
target = await page.evaluate(() => state.target);
spoke = await page.evaluate(() => window.__log.filter(l => l.startsWith('SPEAK:') && l.length > 7));
check('Copy It: auto-play says the word then spells it',
  spoke[spoke.length - 1] === `SPEAK:${target}. ${spellOf(target)}`, JSON.stringify(spoke.slice(-1)));
await page.click('#quit'); await page.waitForSelector('#home.active');

// Listen & Spell: says the word ONLY — never spells it (would give the answer)
await installStub();
await page.click('.section-card.sec-words'); await page.click('.mode-card.listen'); await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active'); await page.waitForTimeout(400);
const lt = await page.evaluate(() => state.target);
const ls = await page.evaluate(() => window.__log.filter(l => l.startsWith('SPEAK:')));
check('Listen & Spell: word only, never spelled',
  ls.includes(`SPEAK:${lt}`) && !ls.some(l => l.includes('. ')), JSON.stringify(ls.slice(-1)));

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
