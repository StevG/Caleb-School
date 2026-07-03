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

// stub logs each utterance's text + rate and fires onstart/onend so chained
// sequences (word, then the slower spelling) actually advance
const installStub = () => page.evaluate(() => {
  window.__log = []; window.__utts = [];
  const stub = { speaking: false, pending: false, resume() {},
    cancel() { window.__log.push('CANCEL'); this.speaking = false; },
    speak(u) {
      window.__log.push('SPEAK:' + u.text);
      window.__utts.push({ text: u.text, rate: u.rate });
      this.speaking = true;
      if (u.onstart) u.onstart();
      if (u.onend) setTimeout(() => { this.speaking = false; u.onend(); }, 0);
    } };
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

// Hide & Spell: auto-play says the word, THEN spells it as a separate,
// slower utterance (word at normal speed, letters slower)
await page.click('.section-card.sec-words'); await page.click('.mode-card.words'); await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active'); await page.waitForTimeout(500);
let target = await page.evaluate(() => state.target);
let utts = await page.evaluate(() => window.__utts.filter(u => u.text));
const wordU = utts.find(u => u.text === target);
const spellU = utts.find(u => u.text === spellOf(target));
check('Hide & Spell: auto-play says the word (normal speed)',
  !!wordU && wordU.rate >= 0.7, JSON.stringify(wordU));
check('Hide & Spell: then spells the letters, and SLOWER than the word',
  !!spellU && spellU.rate < wordU.rate, JSON.stringify([wordU, spellU]));

// typing stops the audio (so the spelling can't be copied)
await page.evaluate(() => { window.__log = []; });
await page.focus('#typed'); await page.type('#typed', target[0]); await page.waitForTimeout(150);
check('typing stops the audio', await page.evaluate(() => window.__log.includes('CANCEL')));

// AFTER he's started typing, tapping 🔊 says the WORD ONLY — no more spelling
await page.evaluate(() => { window.__log = []; window.__utts = []; });
await page.click('#speaker'); await page.waitForTimeout(250);
const afterType = await page.evaluate(() => window.__utts.filter(u => u.text));
check('after typing: 🔊 says the word only, never spells it',
  afterType.length === 1 && afterType[0].text === target, JSON.stringify(afterType));
await page.fill('#typed', target); await page.dispatchEvent('#typed', 'input');
await page.click('#check'); await page.waitForTimeout(1100);
await page.click('#quit'); await page.waitForSelector('#home.active');

// Copy It: also auto-plays word + (slower) spelling
await installStub();
await page.click('.section-card.sec-words'); await page.click('.mode-card.copy'); await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active'); await page.waitForTimeout(500);
target = await page.evaluate(() => state.target);
utts = await page.evaluate(() => window.__utts.filter(u => u.text));
check('Copy It: auto-play says the word then spells it (slower)',
  utts.some(u => u.text === target) && utts.some(u => u.text === spellOf(target)), JSON.stringify(utts.map(u => u.text)));
await page.click('#quit'); await page.waitForSelector('#home.active');

// Listen & Spell: says the word ONLY — never spells it (would give the answer)
await installStub();
await page.click('.section-card.sec-words'); await page.click('.mode-card.listen'); await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active'); await page.waitForTimeout(400);
const lt = await page.evaluate(() => state.target);
const ls = await page.evaluate(() => window.__log.filter(l => l.startsWith('SPEAK:')));
check('Listen & Spell: word only, never spelled',
  ls.includes(`SPEAK:${lt}`) && !ls.some(l => l.includes('. ')), JSON.stringify(ls.slice(-1)));
await page.click('#quit'); await page.waitForSelector('#home.active');

// parent audio-speed sliders: adjusting reads an example at the NEW rate and
// saves it per child; the child's session then speaks at that rate
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForTimeout(600);
const defaults = await page.evaluate(() => ({
  w: document.querySelector('#set-word-rate').value,
  s: document.querySelector('#set-spell-rate').value }));
check('sliders load the saved rates (defaults 0.8 / 0.45)',
  defaults.w === '0.8' && defaults.s === '0.45', JSON.stringify(defaults));
await installStub();
const demo = await page.evaluate(() => {
  window.__utts = [];
  const set = (id, v) => { const s = document.getElementById(id); s.value = v;
    s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); };
  set('set-word-rate', '1.1');
  return new Promise(r => setTimeout(() => r(window.__utts.slice()), 200));
});
check('word slider: reads a word example at the new rate',
  demo.length === 1 && demo[0].rate > 1.0 && !demo[0].text.includes('. '), JSON.stringify(demo));
const demo2 = await page.evaluate(() => {
  window.__utts = [];
  const s = document.getElementById('set-spell-rate'); s.value = '0.6';
  s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change'));
  return new Promise(r => setTimeout(() => r(window.__utts.slice()), 200));
});
check('spell slider: spells an example at the new rate',
  demo2.length === 1 && Math.abs(demo2[0].rate - 0.6) < 0.01 && demo2[0].text.includes('. '), JSON.stringify(demo2));
const savedRates = await page.evaluate(async () => {
  const r = await (await fetch('/api/parent/report', { headers: { 'X-Parent-Pin': '1234' } })).json();
  return { w: r.profile.word_rate, s: r.profile.spell_rate };
});
check('slider changes persist to the server', savedRates.w === 1.1 && savedRates.s === 0.6, JSON.stringify(savedRates));

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
